#!/usr/bin/env node

/**
 * Script to convert a video into a set of files to play using HLS.
 */

// Import modules
import path, { basename } from 'node:path';
import process from 'process';
import fs from 'node:fs';

// Helper modules
import { logger, cmd, convertSecondsToTimestamp } from './lib/helpers.js';
import getArgs from './lib/getArgs.js';
import probeStats from './lib/probeStats.js';

// External modules
import sharp from 'sharp';
import { globSync } from 'glob';

const opts = {
	args: getArgs.positionals,
	...getArgs.values,
	ffmpeg: [
		// Configure logging
		'-loglevel',
		'warning',
		'-hide_banner',
		// Ignore input chapters
		'-ignore_chapters',
		'1',
		'-stats_period',
		'0.25',
		// Use progress
		'-progress',
		'-',
	],
	hls: {
		type: 'mpegts',
		interval: 6,
		segmentName: '{stream}/segment_{index}',
		mainPlaylist: 'manifest.m3u8',
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
		profile: 'aac_low',
		bitrate: '256k',
	},
	mosaic: {
		imagesPerRow: 6,
		tileheight: 144,
		minInterval: 1,
		maxInterval: 10,
		maxImages: 180,
	},
};

// Set overwrite option
opts.ffmpeg.push(opts.overwrite ? '-y' : '-n');

let tmpPath;

try {
	if (opts.args.length !== 1) {
		throw new Error(`Need 1 non-option argument, recieved ${opts.args.length}`);
	}

	// Extract path to process
	logger('info', 'Resolving paths...');
	const sourcePath = path.resolve(opts.args[0]);
	const sourcePathData = path.parse(sourcePath);
	const outputPath = path.resolve(
		opts.output || (sourcePathData.dir, sourcePathData.name)
	);
	tmpPath = path.join(outputPath, '_tmp');

	// Create output directories
	await fs.promises.mkdir(outputPath, { recursive: true });
	await fs.promises.mkdir(tmpPath, { recursive: true });

	// Pt. 1 - Handle Video Files ------------------------------

	// Get stats
	logger('info', 'Getting file data...');
	const stats = await probeStats(sourcePath);

	// Define globals
	const [VIDEO, AUDIO] = [
		Boolean(stats.streams.video),
		Boolean(stats.streams.audio),
	];

	// Add source path to args
	opts.ffmpeg.push('-i', sourcePath);

	// Filter resolutions from options
	opts.video.resolutions = opts.video.resolutions.filter((resolution) => {
		const validResolution = resolution.height <= stats.streams.video.height;

		if (!validResolution) {
			logger(
				'warn',
				`Skipping ${resolution.height}p output, source is ${stats.streams.video.height}p`
			);
		}

		return validResolution;
	});

	// Handle poster frame creation
	const posterFramePath = path.join(outputPath, 'poster.jpg');
	if (!opts.poster && (opts.overwrite || !fs.existsSync(posterFramePath))) {
		logger('event', 'Poster frame requested');
		const posterArgs = VIDEO && [
			// Use image2 as muxer
			'-f',
			'image2',
			// Select video stream
			'-map',
			`0:${stats.streams.video.index}`,
			// Seek to 5s
			'-ss',
			stats.totalDuration * 0.05,
			// Select 1 frame from video and force output to be filename
			'-frames:v',
			'1',
			'-update',
			'1',
			// Output
			path.join(tmpPath, 'poster.png'),
		];
		opts.ffmpeg.push(posterArgs);
	} else if (!opts.poster) {
		throw new Error(
			`Poster \`${posterFramePath}\` already exists; use --overwrite to force recreation`
		);
	}

	if (!opts['skip-mp4']) {
		logger('event', 'Progressive MP4 was requested');
		const mp4Args = [
			// Use mp4 as the format
			'-f',
			'mp4',
			VIDEO && [
				// Select video track
				'-map',
				`0:${stats.streams.video.index}`,
				// Scale down to 720p if larger to 720p
				'-filter:v',
				`scale=-2:'min(720,ih)',format=${opts.video.pixelFormat}`,
				// Use h264 as video codec
				'-c:v',
				opts.video.codec,
				// Set video profile
				'-profile:v',
				'main',
				'-level:v',
				'3.1',
				// Set bitrate options
				'-b:v',
				'2000k',
				'-maxrate:v',
				'2000k',
				'-bufsize:v',
				'3000k',
			],
			AUDIO && [
				// Select audio track
				'-map',
				`0:${stats.streams.audio.index}`,
				// Select audio codec
				'-c:a',
				opts.audio.codec,
				// Reuse same sample rate from input
				'-ar',
				stats.streams.audio.sample_rate,
				// Set audio profile
				'-profile:a',
				opts.audio.profile,
				// Set audio bitrate
				'-b:a',
				'128k',
			],
			// Move index to beginning
			'-movflags',
			'+faststart',
			// Set output filename
			`${outputPath}/progressive.mp4`,
		];
		opts.ffmpeg.push(mp4Args);
	}

	if (!opts['skip-hls']) {
		logger('event', 'HLS package was requested');
		const hlsKeyDistance = (stats.videoFPSNumber * opts.hls.interval).toFixed();
		const hlsSegmentExtension = { mpegts: 'ts', fmp4: 'm4s' }[opts.hls.type];
		const hlsSegmentName = opts.hls.segmentName
			.replace('{stream}', '%v')
			.replace('{index}', '%04d');
		const hlsSegmentPath = path.join(outputPath, hlsSegmentName);
		const hlsArgs = [
			// Use HLS as format
			'-f',
			'hls',
			VIDEO && [
				// Set video codec and keyframes
				'-c:v',
				opts.video.codec,
				'-g',
				hlsKeyDistance,
				'-keyint_min',
				hlsKeyDistance,
				// Set audio codec and sample rate
				'-c:a',
			],
			AUDIO && [
				opts.audio.codec,
				'-ar',
				stats.streams.audio.sample_rate,
				// Set additional HLS options
				'-hls_playlist_type',
				'vod',
				'-hls_segment_type',
			],
			opts.hls.type,
			'-hls_time',
			opts.hls.interval,
			'-hls_list_size',
			'0',
			'-master_pl_name',
			opts.hls.mainPlaylist,
			'-hls_segment_filename',
			`${hlsSegmentPath}.${hlsSegmentExtension}`,

			// Iterate through resolutions
			opts.video.resolutions.map((resolution, index) => {
				const resolutionProfile = resolution.profile.split('@');
				const numericRate = Number(resolution.bitrate.replace(/[A-z]/, ''));
				return [
					// Video Options
					VIDEO && [
						'-map',
						`0:${stats.streams.video.index}`,
						`-filter:v:${index}`,
						`scale=-2:${resolution.height},format=${opts.video.pixelFormat}`,
						`-profile:v:${index}`,
						resolutionProfile[0],
						`-level:v:${index}`,
						resolutionProfile[1],
						`-b:v:${index}`,
						resolution.bitrate,
						`-maxrate:v:${index}`,
						resolution.bitrate,
						`-bufsize:v:${index}`,
						`${numericRate * 1.5}k`,
					],

					// Audio options
					AUDIO && [
						'-map',
						`0:${stats.streams.audio.index}`,
						`-profile:a:${index}`,
						opts.audio.profile,
						`-b:a:${index}`,
						opts.audio.bitrate,
					],
				];
			}),

			// Build var_stream_map
			'-var_stream_map',
			opts.video.resolutions
				.map((resolution, index) =>
					[
						VIDEO && `v:${index}`,
						AUDIO && `a:${index}`,
						`name:${resolution.height}p`,
					]
						.filter(Boolean)
						.join(',')
				)
				.join(' '),

			// Set output
			path.join(path.dirname(hlsSegmentPath), 'index.m3u8'),
		];
		opts.ffmpeg.push(hlsArgs);
	}

	if (!opts['skip-seek-previews']) {
		logger('event', 'Seek preview sprite requested');
		opts.mosaic.interval = Math.min(
			opts.mosaic.maxInterval,
			Math.max(opts.mosaic.minInterval, stats.totalDuration / 60)
		);
		opts.mosaic.frames = Math.min(
			180,
			stats.totalDuration / opts.mosaic.minInterval
		).toFixed();
		const seekArgs = VIDEO && [
			// Use image2 as format
			'-f',
			'image2',
			// Select video stream
			'-map',
			`0:${stats.streams.video.index}`,
			// Create losless pngs to start
			'-c:v',
			'png',
			// Scale to specified size and set framerate
			'-filter:v',
			`scale=-2:${opts.mosaic.tileheight},select='not(mod(\\n,${Math.ceil(
				stats.streams.video.nb_frames / opts.mosaic.frames
			)}))`,
			'-fps_mode',
			'passthrough',
			// Set output
			path.join(tmpPath, 'seek_%04d.png'),
		];
		opts.ffmpeg.push(seekArgs);
	}

	// Encode everything
	await cmd('ffmpeg', opts.ffmpeg, stats.totalDuration);

	// Pt. 2 - Handle Image Files ------------------------------

	// If a poster wasn't provided, time to set that
	if (!opts.poster) opts.poster = path.join(tmpPath, 'poster.png');
	logger('event', 'Creating poster.jpg');
	sharp(opts.poster)
		.resize(null, opts.video.resolutions[0].height)
		.jpeg()
		.toFile(path.join(posterFramePath));

	if (!opts['skip-seek-previews']) {
		logger('event', 'Creating preview mosaic');
		const seekDir = path.join(outputPath, 'seek');
		await fs.promises.mkdir(seekDir, { recursive: true });

		// Collect list of files for mosaic
		const seekImages = globSync(path.join(tmpPath, 'seek_*.png')).sort();

		// Use the first image to get some metadata
		const seekImageMeta = await sharp(seekImages[0]).metadata();

		// Compute some stats
		const rows = Math.ceil(seekImages.length / opts.mosaic.imagesPerRow);
		const totalWidth = seekImageMeta.width * opts.mosaic.imagesPerRow;
		const totalHeight = seekImageMeta.height * rows;

		// Compose a new mosaic image by remapping the file array into a new sharp image.
		// Create an array of times for the VTT file as array is mapped.
		const vttEntries = ['WEBVTT'];

		await sharp({
			create: {
				background: '#AAA',
				channels: 3,
				width: totalWidth,
				height: totalHeight,
			},
		})
			.composite(
				seekImages.map((image, index) => {
					const currentTime = index * opts.mosaic.interval;
					const x =
						Math.floor(index % opts.mosaic.imagesPerRow) * seekImageMeta.width;
					const y =
						Math.floor(index / opts.mosaic.imagesPerRow) * seekImageMeta.height;
					vttEntries.push(
						`${convertSecondsToTimestamp(
							currentTime
						)} --> ${convertSecondsToTimestamp(
							currentTime + opts.mosaic.interval
						)}\nmosaic.jpg#xywh=${x},${y},${seekImageMeta.width},${
							seekImageMeta.height
						}`
					);

					return {
						input: image,
						left: x,
						top: y,
					};
				})
			)
			.toFile(path.join(seekDir, 'mosaic.jpg'));

		await fs.promises.writeFile(
			path.join(seekDir, 'previews.vtt'),
			vttEntries.join('\n\n')
		);
	}
} catch (error) {
	logger('error', error.stack);
	process.exit(error.code || process.exitCode || 126);
}

// Clean up tempdir
await fs.promises.rm(tmpPath, {
	recursive: true,
	force: true,
});
