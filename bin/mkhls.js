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
import logger from '../utils/logger.js';
import convertTime from '../utils/convertTime.js';
import FFmpeg from '../lib/ffmpeg.js';
import opts from '../lib/getOpts.js';

// External modules
import sharp from 'sharp';
import { globSync } from 'glob';
import kleur from 'kleur';

try {
	const totalFilesToProcess = opts.positionals.length;

	if (totalFilesToProcess === 0) {
		throw new Error(
			`Need at least 1 non-option argument, recieved ${opts.positionals.length}`
		);
	}

	for await (const [step, item] of opts.positionals.entries()) {
		if (item)
			console.log(
				kleur.bold(`Encoding ${item} (${step + 1} of ${totalFilesToProcess})`)
			);

		const { transcoder, globals, paths } = await setup(item);
		await processVideo(transcoder, globals, paths);
		await processImages(transcoder, paths);

		// Clean up tempdir
		await fs.promises.rm(paths.tmp, {
			recursive: true,
			force: true,
		});
	}
} catch (error) {
	logger('error', error.stack);
	if (typeof error.code === 'number')
		process.exit(error.code || process.exitCode);
	process.exit(126);
}

async function setup(source) {
	// Instance ffmpeg handler
	const transcoder = new FFmpeg();

	// Set overwrite option
	transcoder.addArguments(opts.overwrite ? '-y' : '-n');

	// Extract path to process
	logger('info', 'Resolving paths...');
	const sourcePath = path.resolve(source);

	// Get stats
	logger('info', 'Getting file data...');
	await transcoder.loadMeta(sourcePath);

	// Destructure shorthand globals for specs
	const {
		fpsDecimal: $FPS,
		format: $FORMAT,
		streams: { video: $VIDEO, audio: $AUDIO },
	} = transcoder.specs;

	const hashedName = crypto
		.createHash('shake256', { outputLength: 6 })
		.update(transcoder.meta.path.name)
		.digest('hex');
	const outputPath = path.resolve(opts.output || process.cwd(), hashedName);
	const tmpPath = path.join(outputPath, '_tmp');

	// Find poster frames
	if (
		$VIDEO &&
		(opts.overwrite || !fs.existsSync(path.join(outputPath, 'poster.jpg')))
	) {
		const extPattern = '{jp?(e)g,tif?(f),png,webp}';
		const posterFrameMatches = [
			globSync(
				`${transcoder.meta.path.dir}/${transcoder.meta.path.name}.${extPattern}`
			),
			globSync(`${transcoder.meta.path.dir}/*.${extPattern}`).sort(),
		];

		transcoder.meta.poster =
			posterFrameMatches[0][0] || posterFrameMatches[1][0];
	} else {
		throw new Error(
			`Error: Poster ${path.join(outputPath, 'poster.jpg')} already exists!`
		);
	}

	// Create output directories
	await fs.promises.mkdir(outputPath, { recursive: true });
	await fs.promises.mkdir(tmpPath, { recursive: true });

	return {
		transcoder,
		globals: {
			$FORMAT,
			$FPS,
			$VIDEO,
			$AUDIO,
			$HASHEDNAME: hashedName,
		},
		paths: {
			source: sourcePath,
			tmp: tmpPath,
			output: outputPath,
		},
	};
}

async function processVideo(transcoder, globals, paths) {
	// Destructure globals
	const { $VIDEO, $AUDIO, $FORMAT, $FPS } = globals;

	// Add source path to args
	transcoder.addArguments('-i', paths.source);

	// Filter resolutions from options
	if ($VIDEO) {
		opts.video.resolutions = opts.video.resolutions.filter((resolution) => {
			const validResolution = resolution.height <= $VIDEO.height;

			if (!validResolution) {
				logger(
					'event',
					`Skipping ${resolution.height}p output, source is ${$VIDEO.height}p`
				);
			}

			return validResolution;
		});
	}

	// Handle poster frame creation

	if (!transcoder.meta.poster) {
		logger('info', 'Poster frame requested');
		transcoder
			.addArgumentSet({
				f: 'image2',
				map: `0:${$VIDEO.index}`,
				ss: $FORMAT.duration * 0.05,
				'frames:v': 1,
				update: 1,
			})
			.addArguments(path.join(paths.tmp, 'poster.png'));
	}

	if (!opts['skip-fallback']) {
		if ($VIDEO) {
			logger('info', 'Progressive MP4 was requested');
			transcoder.addArgumentSet({
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
				transcoder.addArgumentSet({
					map: `0:${$AUDIO.index}`,
					'profile:a': opts.audio.profile,
					'codec:a': opts.audio.codec,
					ar: $AUDIO.sample_rate,
					'b:a': '96k',
				});
			}

			transcoder.addArguments(
				'-movflags',
				'+faststart',
				path.join(paths.output, 'progressive.mp4')
			);
		} else {
			transcoder.addArgumentSet(
				{
					f: 'mp3',
					map: `0:${$AUDIO.index}`,
					'codec:a': 'libmp3lame',
					'b:a': opts.audio.bitrate,
				},
				path.join(paths.output, 'progressive.mp3')
			);
		}
	}

	if (!opts['skip-hls']) {
		logger('info', 'HLS package was requested');
		const hlsKeyDistance = ($FPS * opts.hls.interval).toFixed();
		const hlsSegmentExtension = { mpegts: 'ts', fmp4: 'm4s' }[opts.hls.type];
		const hlsSegmentName = opts.hls.segmentName
			.replace('{stream}', '%v')
			.replace('{index}', '%04d');
		const hlsSegmentPath = path.join(paths.output, hlsSegmentName);

		// Use HLS as format
		transcoder.addArguments('-f', 'hls');

		if ($VIDEO) {
			transcoder.addArgumentSet({
				'c:v': opts.video.codec,
				g: hlsKeyDistance,
				keyint_min: hlsKeyDistance,
			});
		}

		if ($AUDIO) {
			transcoder.addArgumentSet({
				'c:a': opts.audio.codec,
				ar: $AUDIO.sample_rate,
			});
		}

		transcoder.addArgumentSet({
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

				transcoder.addArgumentSet({
					map: `0:${$VIDEO.index}`,
					[`filter:v:${index}`]: `scale=-2:${resolution.height},format=${opts.video.pixelFormat}`,
					[`profile:v:${index}`]: resolutionProfile[0],
					[`level:v:${index}`]: resolutionProfile[1],
					[`b:v:${index}`]: resolution.bitrate,
					[`maxrate:v:${index}`]: resolution.bitrate,
					[`bufsize:v:${index}`]: `${numericRate * 1.5}k`,
				});

				if ($AUDIO) {
					transcoder.addArgumentSet({
						map: `0:${$AUDIO.index}`,
						[`profile:a:${index}`]: opts.audio.profile,
						[`b:a:${index}`]: opts.audio.bitrate,
					});
				}
			});
		}

		transcoder.addArgumentSet({
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
		transcoder.addArguments(
			path.join(path.dirname(hlsSegmentPath), 'index.m3u8')
		);
	}

	if (!opts['skip-seek-previews']) {
		logger('info', 'Seek preview sprite requested');
		opts.mosaic.interval = Math.min(
			opts.mosaic.maxInterval,
			Math.max(opts.mosaic.minInterval, $FORMAT.duration / 60)
		);
		opts.mosaic.frames = Math.min(
			180,
			$FORMAT.duration / opts.mosaic.minInterval
		).toFixed();

		transcoder.addArgumentSet({
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

		transcoder.addArguments(path.join(paths.tmp, 'seek_%04d.png'));
	}

	// Encode everything
	return transcoder.start();
}

async function processImages(transcoder, paths) {
	// If a poster wasn't provided, time to set that
	logger('event', 'Creating poster.jpg');
	sharp(transcoder.meta.poster || path.join(paths.tmp, 'poster.png'))
		.resize(null, opts.video.resolutions[0].height)
		.jpeg()
		.toFile(path.join(paths.output, 'poster.jpg'));

	if (!opts['skip-seek-previews']) {
		logger('event', 'Creating preview mosaic');
		const seekDir = path.join(paths.output, 'seek');
		await fs.promises.mkdir(seekDir, { recursive: true });

		// Collect list of files for mosaic
		const seekImages = globSync(path.join(paths.tmp, 'seek_*.png')).sort();

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
						`${convertTime.toTimestamp(
							currentTime
						)} --> ${convertTime.toTimestamp(
							currentTime + opts.mosaic.interval
						)}\n/${paths.hashed}/seek/storyboard.jpg#xywh=${x},${y},${
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
}
