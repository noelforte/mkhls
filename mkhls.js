#!/usr/bin/env node

/**
 * Script to convert a video into a set of files to play using HLS.
 */

// Import modules
import path from 'node:path';
import process from 'process';
import fs from 'node:fs';
import crypto from 'node:crypto';

// Helper modules
import { logger, convertSecondsToTimestamp } from './lib/utils.js';
import getArgs from './lib/getArgs.js';
import Transcoder from './lib/transcoder.js';

// External modules
import sharp from 'sharp';
import { globSync } from 'glob';

const opts = {
	args: getArgs.positionals,
	...getArgs.values,
	hls: {
		type: 'mpegts',
		interval: 6,
		segmentName: '{stream}/segment_{index}',
		mainPlaylist: 'manifest.m3u8',
		noCodecs: true,
	},
	video: {
		codec: 'libx264',
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

// Instance the transcoder
const transcode = new Transcoder();

// Set overwrite option
transcode.addArguments(opts.overwrite ? '-y' : '-n');

let tmpPath;

try {
	if (opts.args.length !== 1) {
		throw new Error(`Need 1 non-option argument, recieved ${opts.args.length}`);
	}

	// Extract path to process
	logger('info', 'Resolving paths...');
	const sourcePath = path.resolve(opts.args[0]);

	// Get stats
	logger('info', 'Getting file data...');
	await transcode.loadMeta(sourcePath);

	// Destructure shorthand globals for specs
	const {
		fpsDecimal: $FPS,
		format: $FORMAT,
		streams: { video: $VIDEO, audio: $AUDIO },
	} = transcode.specs;

	const hashedName = crypto
		.createHash('shake256', { outputLength: 6 })
		.update(transcode.meta.path.name)
		.digest('hex');
	const outputPath = path.resolve(opts.output || process.cwd(), hashedName);
	tmpPath = path.join(outputPath, '_tmp');

	// Create output directories
	await fs.promises.mkdir(outputPath, { recursive: true });
	await fs.promises.mkdir(tmpPath, { recursive: true });

	// ###################################################################### //
	// Pt. 1 - Handle Video Files  																						//
	// ###################################################################### //

	// Add source path to args
	transcode.addArguments('-i', sourcePath);

	// Filter resolutions from options
	if ($VIDEO) {
		opts.video.resolutions = opts.video.resolutions.filter((resolution) => {
			const validResolution = resolution.height <= $VIDEO.height;

			if (!validResolution) {
				logger(
					'warn',
					`Skipping ${resolution.height}p output, source is ${$VIDEO.height}p`
				);
			}

			return validResolution;
		});
	}

	// Handle poster frame creation
	const posterFramePath = path.join(outputPath, 'poster.jpg');
	if (
		$VIDEO &&
		!opts.poster &&
		(opts.overwrite || !fs.existsSync(posterFramePath))
	) {
		logger('event', 'Poster frame requested');
		transcode
			.addArgumentSet({
				f: 'image2',
				map: `0:${$VIDEO.index}`,
				ss: $FORMAT.duration * 0.05,
				'frames:v': 1,
				update: 1,
			})
			.addArguments(path.join(tmpPath, 'poster.png'));
	} else if (!opts.poster) {
		throw new Error(
			`Poster \`${posterFramePath}\` already exists; use --overwrite to force recreation`
		);
	}

	if (!opts['skip-fallback']) {
		if ($VIDEO) {
			logger('event', 'Progressive MP4 was requested');
			transcode.addArgumentSet({
				f: 'mp4',
				map: `0:${$VIDEO.index}`,
				vf: ["scale=-2:'min(720,ih)'", `format=${opts.video.pixelFormat}`],
				'codec:v': 'libx264',
				'profile:v': 'main',
				'level:v': 3.1,
				'b:v': '2000k',
				'maxrate:v': '2000k',
				'bufsize:v': '3000k',
			});
			if ($AUDIO) {
				transcode.addArgumentSet({
					map: `0:${$AUDIO.index}`,
					'profile:a': opts.audio.profile,
					'codec:a': opts.audio.codec,
					ar: $AUDIO.sample_rate,
					'b:a': '96k',
				});
			}

			transcode.addArguments(
				'-movflags',
				'+faststart',
				path.join(outputPath, 'progressive.mp4')
			);
		} else {
			transcode.addArgumentSet(
				{
					f: 'mp3',
					map: `0:${$AUDIO.index}`,
					'codec:a': 'libmp3lame',
					'b:a': opts.audio.bitrate,
				},
				path.join(outputPath, 'progressive.mp3')
			);
		}
	}

	if (!opts['skip-hls']) {
		logger('event', 'HLS package was requested');
		const hlsKeyDistance = ($FPS * opts.hls.interval).toFixed();
		const hlsSegmentExtension = { mpegts: 'ts', fmp4: 'm4s' }[opts.hls.type];
		const hlsSegmentName = opts.hls.segmentName
			.replace('{stream}', '%v')
			.replace('{index}', '%04d');
		const hlsSegmentPath = path.join(outputPath, hlsSegmentName);

		// Use HLS as format
		transcode.addArguments('-f', 'hls');

		if ($VIDEO) {
			transcode.addArgumentSet({
				'c:v': opts.video.codec,
				g: hlsKeyDistance,
				keyint_min: hlsKeyDistance,
			});
		}

		if ($AUDIO) {
			transcode.addArgumentSet({
				'c:a': opts.audio.codec,
				ar: $AUDIO.sample_rate,
			});
		}

		transcode.addArgumentSet({
			hls_playlist_type: 'vod',
			hls_segment_type: opts.hls.type,
			hls_time: opts.hls.interval,
			hls_list_size: 0,
			master_pl_name: opts.hls.mainPlaylist,
			hls_segment_filename: `${hlsSegmentPath}.${hlsSegmentExtension}`,
		});

		if ($VIDEO) {
			opts.video.resolutions.forEach((resolution, index) => {
				const resolutionProfile = resolution.profile.split('@');
				const numericRate = Number(resolution.bitrate.replace(/[A-z]/, ''));

				transcode.addArgumentSet({
					map: `0:${$VIDEO.index}`,
					[`filter:v:${index}`]: `scale=-2:${resolution.height},format=${opts.video.pixelFormat}`,
					[`profile:v:${index}`]: resolutionProfile[0],
					[`level:v:${index}`]: resolutionProfile[1],
					[`b:v:${index}`]: resolution.bitrate,
					[`maxrate:v:${index}`]: resolution.bitrate,
					[`bufsize:v:${index}`]: `${numericRate * 1.5}k`,
				});

				if ($AUDIO) {
					transcode.addArgumentSet({
						map: `0:${$AUDIO.index}`,
						[`profile:a:${index}`]: opts.audio.profile,
						[`b:a:${index}`]: opts.audio.bitrate,
					});
				}
			});
		}

		transcode.addArgumentSet({
			var_stream_map: opts.video.resolutions
				.map((resolution, index) =>
					[
						$VIDEO && `v:${index}`,
						$AUDIO && `a:${index}`,
						`name:${resolution.height}p`,
					]
						.filter(Boolean)
						.join()
				)
				.join(' '),
		});

		// Set output
		transcode.addArguments(
			path.join(path.dirname(hlsSegmentPath), 'index.m3u8')
		);
	}

	if (!opts['skip-seek-previews']) {
		logger('event', 'Seek preview sprite requested');
		opts.mosaic.interval = Math.min(
			opts.mosaic.maxInterval,
			Math.max(opts.mosaic.minInterval, $FORMAT.duration / 60)
		);
		opts.mosaic.frames = Math.min(
			180,
			$FORMAT.duration / opts.mosaic.minInterval
		).toFixed();

		transcode.addArgumentSet({
			f: 'image2',
			map: `0:${$VIDEO.index}`,
			'c:v': 'png',
			'filter:v': `scale=-2:${
				opts.mosaic.tileheight
			},select='not(mod(\\n,${Math.ceil(
				$VIDEO.nb_frames / opts.mosaic.frames
			)}))'`,
			fps_mode: 'passthrough',
		});

		transcode.addArguments(path.join(tmpPath, 'seek_%04d.png'));
	}

	// Encode everything
	await transcode.start();

	// ###################################################################### //
	// Pt. 2 - Handle Image Files  																						//
	// ###################################################################### //

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
						)}\n/${hashedName}/seek/storyboard.jpg#xywh=${x},${y},${
							seekImageMeta.width
						},${seekImageMeta.height}`
					);

					return {
						input: image,
						left: x,
						top: y,
					};
				})
			)
			.toFile(path.join(seekDir, 'storyboard.jpg'));

		await fs.promises.writeFile(
			path.join(seekDir, 'thumbnails.vtt'),
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
