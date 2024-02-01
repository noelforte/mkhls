#!/usr/bin/env node

/**
 * Script to convert a video into a set of files to play using HLS.
 */

// Import modules
import path from 'node:path';
import process from 'process';
import fs from 'node:fs';

// Local modules
import FFmpeg from '../lib/ffmpeg.js';
import cli from '../lib/cli.js';
import findPoster from '../utils/findPoster.js';
import logger from '../utils/logger.js';
import convertTime from '../utils/convertTime.js';
import getTimelinePreviewSpecs from '../utils/getTimelinePreviewSpecs.js';

// External modules
import sharp from 'sharp';
import kleur from 'kleur';

try {
	console.log(`\n${cli.pkg.name} v${cli.pkg.version}\n\n`);
	const totalFilesToProcess = cli.args.length;

	if (cli.opts.overwrite)
		logger('warn', "--overwrite specified, hope you know what you're doing...");

	/*
	Notable note:
	We for await ... of here because each (really long) ffmpeg call parallel
	processes all outputs of an input. This creats significant load on the 
	system, so forcing parallel execution of parallel execution is
	(probably) not a good idea 
	*/
	for await (const [step, item] of cli.args.entries()) {
		if (item)
			console.log(
				kleur.bold(
					`[${step + 1} of ${totalFilesToProcess}] Packaging ${item}...`
				)
			);

		const { transcoder, globals, paths } = await setup(item);
		logger('info', 'File data:', transcoder, globals, paths);
		await processVideo(transcoder, globals, paths);
		await processImages(transcoder, paths);

		// Clean up tempdir
		await fs.promises.rm(paths.tmp, {
			recursive: true,
			force: true,
		});

		console.log('\n');
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
	transcoder.addArguments('-y');

	// Extract path to process
	logger('info', 'Resolving paths...');
	const sourcePath = path.resolve(source);

	// Get stats
	logger('info', 'Getting file data...');
	transcoder.loadMeta(sourcePath);

	// Destructure shorthand globals for specs
	const {
		frameCount: $FRAME_COUNT,
		fpsDecimal: $FPS,
		format: $FORMAT,
		streams: { video: $VIDEO, audio: $AUDIO },
	} = transcoder.specs;

	cli.opts.output ||= path.dirname(sourcePath);

	const outputPath = path.resolve(
		cli.opts.output,
		cli.opts.outputPrefix,
		transcoder.meta.rel,
		transcoder.meta.slug
	);

	// Handle overwrite
	if (fs.existsSync(outputPath) && !cli.opts.overwrite) {
		throw new Error(
			`Output path ${outputPath} already exists use --overwrite to force overwrite destination.`
		);
	}

	const tmpPath = path.join(outputPath, '_tmp');

	// Build a resolution list and then filter that list down based on input file height
	if ($VIDEO) {
		transcoder.resolutions = cli.opts.videoResolutions
			.map((resolution, index) => {
				if (resolution > $VIDEO.height) {
					logger(
						'event',
						`Skipping ${resolution}p output, source is ${$VIDEO.height}p`
					);

					return;
				}

				const {
					videoBitrates: bitrates,
					videoProfiles: profiles,
					videoLevels: levels,
				} = cli.opts;

				return {
					height: Number(resolution),
					bitrate: Number(bitrates[index] || bitrates[bitrates.length - 1]),
					profile: profiles[index] || profiles[profiles.length - 1],
					level: levels[index] || levels[levels.length - 1],
				};
			})
			.filter(Boolean);
	}

	// Find poster frames
	if ($VIDEO) {
		transcoder.meta.poster = findPoster(sourcePath);
	}

	// Create output directories
	await fs.promises.mkdir(outputPath, { recursive: true });
	await fs.promises.mkdir(tmpPath, { recursive: true });

	return {
		transcoder,
		globals: {
			$FORMAT,
			$FRAME_COUNT,
			$FPS,
			$VIDEO,
			$AUDIO,
		},
		paths: {
			source: sourcePath,
			tmp: tmpPath,
			output: outputPath,
		},
	};
}

/**
 * @param {FFmpeg} transcoder
 */
async function processVideo(transcoder, globals, paths) {
	// Destructure globals
	const { $VIDEO, $AUDIO, $FORMAT, $FPS, $FRAME_COUNT } = globals;

	// Add source path to args
	transcoder.addArguments('-i', paths.source);

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

	if (cli.opts.fallback) {
		if ($VIDEO) {
			logger('info', 'Progressive MP4 was requested');
			transcoder.addArgumentSet({
				f: 'mp4',
				map: `0:${$VIDEO.index}`,
				vf: ["scale=-2:'min(720,ih)'", `format=${cli.opts.videoPixelFormat}`],
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
					'profile:a': cli.opts.audioProfile,
					'codec:a': cli.opts.audioCodec,
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
					'b:a': `${cli.opts.audioBitrate}k`,
				},
				path.join(paths.output, 'progressive.mp3')
			);
		}
	}

	if (cli.opts.hls) {
		logger('info', 'HLS package was requested');
		const hlsKeyDistance = ($FPS * cli.opts.hlsInterval).toFixed();
		const hlsSegmentExtension = { mpegts: 'ts', fmp4: 'm4s' }[cli.opts.hlsType];
		const hlsSegmentName = cli.opts.hlsSegmentName
			.replace('{stream}', '%v')
			.replace('{index}', '%04d');
		const hlsSegmentPath = path.join(paths.output, hlsSegmentName);

		// Use HLS as format
		transcoder.addArguments('-f', 'hls');

		if ($VIDEO) {
			transcoder.addArgumentSet({
				'c:v': cli.opts.videoCodec,
				g: hlsKeyDistance,
				keyint_min: hlsKeyDistance,
			});
		}

		if ($AUDIO) {
			transcoder.addArgumentSet({
				'c:a': cli.opts.audioCodec,
				ar: $AUDIO.sample_rate,
			});
		}

		transcoder.addArgumentSet({
			hls_playlist_type: 'vod',
			hls_segment_type: cli.opts.hlsType,
			hls_time: cli.opts.hlsInterval,
			hls_list_size: 0,
			master_pl_name: cli.opts.hlsRootPlaylistName,
			hls_segment_filename: `${hlsSegmentPath}.${hlsSegmentExtension}`,
		});

		if ($VIDEO) {
			transcoder.resolutions.forEach((resolution, index) => {
				transcoder.addArgumentSet({
					map: `0:${$VIDEO.index}`,
					[`filter:v:${index}`]: `scale=-2:${resolution.height},format=${cli.opts.videoPixelFormat}`,
					[`profile:v:${index}`]: resolution.profile,
					[`level:v:${index}`]: resolution.level,
					[`b:v:${index}`]: `${resolution.bitrate}k`,
					[`maxrate:v:${index}`]: `${resolution.bitrate}k`,
					[`bufsize:v:${index}`]: `${resolution.bitrate * 1.5}k`,
				});

				if ($AUDIO) {
					transcoder.addArgumentSet({
						map: `0:${$AUDIO.index}`,
						[`profile:a:${index}`]: cli.opts.audioProfile,
						[`b:a:${index}`]: `${cli.opts.audioBitrate}k`,
					});
				}
			});
		}

		transcoder.addArgumentSet({
			var_stream_map: transcoder.resolutions
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

	if (cli.opts.timelinePreviews) {
		logger('info', 'Seek preview sprite requested');
		transcoder.meta.mosaic = getTimelinePreviewSpecs(
			transcoder.specs.format.duration
		);

		transcoder.addArgumentSet({
			f: 'image2',
			map: `0:${$VIDEO.index}`,
			'c:v': 'png',
			'filter:v': `scale=-2:${
				cli.opts.timelinePreviewTileHeight
			},select='not(mod(\\n,${Math.ceil(
				$FRAME_COUNT / transcoder.meta.mosaic.frames
			)}))'`,
			fps_mode: 'passthrough',
		});

		transcoder.addArguments(path.join(paths.tmp, 'seek_%04d.png'));
	}

	// Encode everything
	return transcoder.start();
}

async function processImages(transcoder, paths) {
	// Get output format
	const outputFormat = cli.opts.imageFormat;
	const imgExt = outputFormat === 'jpeg' ? 'jpg' : outputFormat;

	// If a poster wasn't provided, time to set that
	logger('event', `Creating poster.${imgExt}`);
	sharp(transcoder.meta.poster || path.join(paths.tmp, 'poster.png'))
		.resize(null, transcoder.resolutions[0].height)
		.toFormat(outputFormat, {
			effort: 6,
			mozjpeg: true,
			preset: 'photo',
			quality: outputFormat === 'jpeg' ? 65 : 80,
		})
		.toFile(path.join(paths.output, `poster.${imgExt}`));

	if (cli.opts.timelinePreviews) {
		logger('event', `Creating storyboard.${imgExt}`);
		const seekDir = path.join(paths.output, 'seek');
		await fs.promises.mkdir(seekDir, { recursive: true });

		// Collect list of files for mosaic
		const seekImages = fs
			.readdirSync(paths.tmp)
			.filter((item) => item.startsWith('seek_'))
			.map((item) => path.resolve(paths.tmp, item));

		// Use the first image to get some metadata
		const seekImageMeta = await sharp(seekImages[0]).metadata();

		// Compute some stats
		const rows = Math.ceil(
			seekImages.length / cli.opts.timelinePreviewSpriteColumns
		);
		const totalWidth =
			seekImageMeta.width * cli.opts.timelinePreviewSpriteColumns;
		const totalHeight = seekImageMeta.height * rows;

		// Map array of image names to an array of objects describing the left and top point of each image
		const imageData = seekImages.map((image, index) => ({
			input: image,
			left:
				Math.floor(index % cli.opts.timelinePreviewSpriteColumns) *
				seekImageMeta.width,
			top:
				Math.floor(index / cli.opts.timelinePreviewSpriteColumns) *
				seekImageMeta.height,
		}));

		// Compose a new mosaic image by remapping the data array into a new sharp image.
		await sharp({
			create: {
				background: '#AAA',
				channels: 3,
				width: totalWidth,
				height: totalHeight,
			},
		})
			.composite(imageData)
			.toFormat(outputFormat, {
				mozjpeg: true,
				quality: outputFormat === 'jpeg' ? 40 : 50,
				preset: 'icon',
			})
			.toFile(path.join(seekDir, `storyboard.${imgExt}`));

		// Create an array of VTT entries by mapping the data array into a set of entries
		logger('event', `Creating thumbnails.vtt`);
		const vttEntries = imageData.map((img, index) => {
			const currentTime = index * transcoder.meta.mosaic.interval;
			const startTimestamp = convertTime.toTimestamp(currentTime);
			const endTimestamp = convertTime.toTimestamp(
				currentTime + transcoder.meta.mosaic.interval
			);
			const tc = `${startTimestamp} --> ${endTimestamp}`;
			const url = path.resolve(
				'/',
				cli.opts.outputPrefix,
				transcoder.meta.rel,
				transcoder.meta.slug,
				`seek/storyboard.${imgExt}#xywh=${img.left},${img.top},${seekImageMeta.width},${seekImageMeta.height}`
			);

			return `${tc}\n${url}`;
		});

		await fs.promises.writeFile(
			path.join(seekDir, 'thumbnails.vtt'),
			['WEBVTT', ...vttEntries].join('\n\n')
		);
	}
}
