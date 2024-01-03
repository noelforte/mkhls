#!/usr/bin/env node

/**
 * Script to convert a video into a set of files to play using HLS.
 */

// Import modules
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

// External modules
import kleur from 'kleur';
import { $, execa, execaCommand } from 'execa';
import * as cliProgress from 'cli-progress';

// Parse command-line arguments
const argv = parseArgs({
  args: process.argv.slice(2),
  options: {
    silent: {
      type: 'boolean',
      short: 's',
      default: false,
    },
    debug: {
      type: 'boolean',
      short: 'd',
      default: false,
    },
    'skip-encode-fallback': {
      type: 'boolean',
      default: false,
    },
    output: {
      type: 'string',
      short: 'o',
    },
    poster: {
      type: 'string',
    },
    overwrite: {
      type: 'boolean',
      default: false,
    },
  },
  allowPositionals: true,
});

// Extract general options into variables
const { silent, debug, overwrite, output, poster } = argv.values;

// Helper functions
const run = (cmd) => execaCommand(cmd, { verbose: debug });
const getTimestamp = () => {
  const date = new Date();
  const padField = (field, places = 0) => String(field).padStart(places, '0');
  return `${padField(date.getHours(), 2)}:${padField(
    date.getMinutes(),
    2
  )}:${padField(date.getSeconds(), 2)}.${padField(date.getMilliseconds(), 3)}`;
};

// Define logging functions
const logger = (meta, ...messages) => {
  const [level, cmd] = meta.split(',');

  if (silent || (level === 'info' && !debug)) return;

  const levelMap = {
    info: 'blue',
    warn: 'yellow',
    error: 'red',
  };

  messages
    .join(' ')
    .split('\n')
    .flat()
    .forEach((message) => {
      console.log(
        kleur[levelMap[level]](
          `[${getTimestamp()}] ${cmd ? `${cmd}: ${message}` : message}`
        )
      );
    });
};

// Define encode options
const encodeOptions = {
  ffmpeg: {
    defaultArgs: [
      // Configure logging
      '-loglevel error',
      '-hide_banner',

      // Set overwrite flag based on input
      overwrite ? '-y' : '-n',
    ],
  },
  hls: {
    type: 'mpegts',
    interval: 6,
    segmentNames: '{resolution}p_{index}',
    mainPlaylist: 'index.m3u8',
    noCodecs: true,
  },
  video: {
    codec: 'h264',
    pixelFormat: 'yuv420p',
    resolutions: [
      { height: 2160, bitrate: '18000k', profile: 'high@5.2' },
      { height: 1440, bitrate: '10000k', profile: 'high@5.2' },
      { height: 1080, bitrate: '6000k', profile: 'high@5.1' },
      { height: 720, bitrate: '3000k', profile: 'high@4.2' },
      { height: 480, bitrate: '1500k', profile: 'high@4.0' },
      { height: 360, bitrate: '800k', profile: 'main@3.1' },
      { height: 240, bitrate: '600k', profile: 'main@3.1' },
    ],
  },
  audio: {
    mute: false,
    codec: 'aac',
    bitrate: '128k',
  },
  mosaic: {
    tiles: 50,
    tileheight: 160,
  },
};

try {
  // Extract path to process
  logger('info', 'Resolving paths...');
  const sourcePath = path.resolve(argv.positionals[0]);
  const sourcePathData = path.parse(sourcePath);
  const outputPath = path.resolve(
    sourcePathData.dir,
    output || sourcePathData.name
  );

  // Add input file to options
  encodeOptions.ffmpeg.defaultArgs.push('-i', sourcePath);

  logger('info', 'Getting file data...');

  // Define args for ffprobe
  const probeArgs = [
    // Logging
    '-hide_banner -loglevel fatal',

    // Make sure the returned data shows select items
    '-show_error',
    '-show_format',
    '-show_streams',
    '-show_programs',
    '-show_chapters',
    '-show_private_data',

    // Format output as JSON
    '-print_format json',
  ];

  const fileData = JSON.parse(
    (await run(`ffprobe ${probeArgs.join(' ')} ${sourcePath}`)).stdout
  );

  // Select streams
  const streams = {
    video: fileData.streams.find((stream) => stream.codec_type === 'video'),
    audio: fileData.streams.find((stream) => stream.codec_type === 'audio'),
  };

  if (streams.video) {
    const fpsParams = streams.video.r_frame_rate.split('/');
    const fps = (fpsParams[0] / fpsParams[1]).toFixed(2);

    logger(
      'info,ffprobe',
      `Selected video stream at index ${streams.video.index}:`,
      `${streams.video.width}x${streams.video.height}`,
      `@ ${fps}fps`
    );
  } else {
    logger('warn', `no video tracks available in ${path}`);
  }

  if (streams.audio) {
    logger(
      'info,ffprobe',
      `Selected audio stream at index ${streams.audio.index}:`,
      `${streams.audio.channels}ch`,
      `@ ${streams.audio.sample_rate}Hz`
    );
  } else {
    logger('warn', `no audio tracks available in ${path}`);
  }

  // Filter sizes
  const filteredResolutions = encodeOptions.video.resolutions.filter(
    (resolution) => {
      if (resolution.height > streams.video.height) {
        logger(
          'warn',
          `skipping ${resolution.height}p resolution as video resolution is ${streams.video.height}p`
        );
      }

      return resolution.height <= streams.video.height;
    }
  );

  logger('info', 'create output directory');
  await fs.mkdir(path.resolve(sourcePathData.dir, sourcePathData.name), {
    recursive: true,
  });

  // Handle poster frame creation
  if (streams.video && poster) {
    const posterPaths = [
      path.resolve(poster),
      path.resolve(outputPath, `poster${path.extname(poster)}`),
    ];
    logger(
      'info',
      `copying poster frame from ${posterPaths[0]} to ${posterPaths[1]}`
    );
    await fs.cp(posterPaths[0], posterPaths[1]);
  } else if (streams.video) {
    logger('info', `generating poster frame from input`);
    const posterArgs = [
      // Insert defaults
      ...encodeOptions.ffmpeg.defaultArgs,

      // Seek to 5%
      `-ss ${Math.round(Number(streams.video.duration) * 0.05)}`,

      // Select video track
      `-map 0:${streams.video.index}`,

      // Use 1 frame
      '-frames:v 1',

      // Filter to select I frame and scale
      `-vf select=eq(pict_type\\,I),scale=-1:${streams.video.height}`,

      // Use a JPEG quality of ~ 10
      '-qscale:v 28',

      // Set output
      `${outputPath}/poster.jpg`,
    ];

    // Await execution
    await run(`ffmpeg ${posterArgs.join(' ')}`);
  }

  logger('info', 'building ffmpeg argument list...');

  // Initialize ffmpeg argument list
  const transcodeArgs = [
    // Insert defaults
    ...encodeOptions.ffmpeg.defaultArgs,

    // Show progress
    '-progress -',
  ];

  // If we're NOT skipping a fallback, add those options
  if (!argv.values['skip-encode-fallback'])
    transcodeArgs.push(
      // Use mp4 as the format
      '-f mp4',

      // Select video track
      `-map 0:${streams.video.index}`,

      // Scale to 720p
      `-vf scale=-1:720,format=${encodeOptions.video.pixelFormat}`,

      // Use h264 as video codec
      `-c:v ${encodeOptions.video.codec}`,

      // Set video profile
      '-profile:v main',
      '-level:v 3.1',

      // Set bitrate options
      '-b:v 2000k',
      '-maxrate:v 2000k',
      '-bufsize:v 3000.0k',

      // Select audio track
      `-map 0:${streams.audio.index}`,

      // Select audio codec
      `-c:a ${encodeOptions.audio.codec}`,

      // Reuse same sample rate from input
      `-ar ${streams.audio.sample_rate}`,

      // Set audio profile
      '-profile:a aac_low',

      // Set audio bitrate
      '-b:a 96k',

      // Move index to beginning
      '-movflags +faststart',

      // Set output filename
      `${outputPath}/progressive.mp4`
    );

  const transcode = run(`ffmpeg ${transcodeArgs.join(' ')}`);

  const progress = new cliProgress.MultiBar(
    {
      format: '{title} [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}',
      clearOnComplete: true,
    },
    cliProgress.Presets.legacy
  );

  const mp4progress = progress.create();

  mp4progress.start(Number(streams.video.nb_frames), 0, {
    title: 'MP4 Fallback',
  });

  transcode.stdout.on('data', (data) => {
    const output = data.toString();
    const stats = output.split('\n').reduce((statsObject, currentElement) => {
      const prop = currentElement.split('=');
      statsObject[prop[0]] = prop[1];
      return statsObject;
    }, {});

    mp4progress.update(Number(stats.frame));
  });

  transcode.stderr.on('data', (data) => {
    const output = data.toString();
    logger('error,ffmpeg', output);
  });

  transcode.stdout.on('close', () => {
    progress.stop();
  });
} catch (error) {
  logger('error', error.message);
}
