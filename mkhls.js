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
import { $ } from 'execa';

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
    overwrite: {
      type: 'boolean',
      default: false,
    },
  },
  allowPositionals: true,
});

// Extract general options into variables
const { silent, debug } = argv.values;

// Define logging functions
function log(level, message) {
  const levelMap = {
    info: 'blue',
    warn: 'yellow',
    error: 'red',
  };

  if (level === 'info' && !debug) return;

  console.log(kleur[levelMap[level]](`[${level}]: ${message}`));

  if (level === 'error') process.exit(1);
}

// Log media info
function showMediaFacts({ video, audio }) {
  const fpsParams = video.r_frame_rate.split('/');
  const fps = (fpsParams[0] / fpsParams[1]).toFixed(2);

  log(
    'info',
    `Selected video stream at index ${video.index}: ${video.width}x${video.height} @ ${fps}fps`
  );
  log(
    'info',
    `Selected audio stream at index ${audio.index}: ${audio.channels}ch @ ${audio.sample_rate}Hz`
  );
}

try {
  // Define encode options
  const encodeOptions = {
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

  // Extract path to process
  log('info', 'Resolving paths...');
  const sourcePath = path.resolve(argv.positionals[0]);
  const parsedPath = path.parse(sourcePath);

  log('info', 'Getting file data...');
  // Define args for ffprobe
  const fileData = JSON.parse(
    (
      await $`ffprobe ${[
        '-hide_banner',
        '-loglevel',
        'fatal',
        '-show_error',
        '-show_format',
        '-show_streams',
        '-show_programs',
        '-show_chapters',
        '-show_private_data',
        '-print_format',
        'json',
      ]} ${sourcePath}`
    ).stdout
  );

  // Select streams
  const streams = {
    video: fileData.streams.find((stream) => stream.codec_type === 'video'),
    audio: fileData.streams.find((stream) => stream.codec_type === 'audio'),
  };

  showMediaFacts(streams);

  // Filter sizes
  const filteredResolutions = encodeOptions.video.resolutions.filter(
    (resolution) => {
      if (resolution.height > streams.video.height) {
        log('info', `skipping ${resolution.height}p resolution`);
      }

      return resolution.height <= streams.video.height;
    }
  );

  // Initialize ffmpeg argument list
  const transcodeArgs = [
    // Minimal logging
    '-loglevel error -hide_banner',

    // Use sourcefile path
    `-i ${sourcePath}`,
  ];

  // If we're NOT skipping a fallback, add those options
  if (!argv.values['skip-encode-fallback'])
    transcodeArgs.push(
      // Use mp4 as the format
      '-f mp4',
      // Selec video track
      `-map 0:${streams.video.index}`,
      // Scale to 720p
      `-vf scale=-1:720,format=${encodeOptions.video.pixelFormat}`,
      // Use h264 as video codec
      `-c:v ${encodeOptions.video.codec}`,
      // Set video profile
      '-profile:v main -level:v 3.1',
      // Set bitrate options
      '-b:v 2000k -maxrate:v 2000k -bufsize:v 3000.0k',
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
      'progressive.mp4'
    );

  console.log(transcodeArgs.join(' '));
} catch (error) {
  log('error', error.message);
}
