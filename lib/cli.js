import fs from 'node:fs';
import kleur from 'kleur';
import { Command, Option } from 'commander';
import process from 'node:process';

const pkg = JSON.parse(
	fs.readFileSync(new URL('../package.json', import.meta.url))
);

const program = new Command()
	.name(pkg.name)

	// Core options
	.argument('<files...>', 'One or more files to process')
	.addOption(
		new Option(
			'-o, --output <path>',
			'Path to directory to output the packaged files'
		).default(false, '(same as input)')
	)
	.option(
		'--output-prefix <path>',
		'Optional prefix to amend to output and prepend to URLs in the VTT files with. Useful for hosting files under a base path.',
		''
	)

	// HLS Options
	.addOption(
		new Option('--hls-type <type>', 'What type of HLS files should be encoded')
			.default('mpegts')
			.choices(['mpegts', 'fmp4'])
	)
	.option(
		'--hls-interval <interval>',
		'Length of HLS segements to encode in seconds',
		4
	)
	.option(
		'--hls-segment-name <name>',
		'Output segment name template to use. Available placeholders are {stream} (the name of the stream) and {index} (the segment index).',
		'{stream}/segment_{index}'
	)
	.option(
		'--hls-root-playlist-name <name>',
		'Filename of the root/main playlist file',
		'manifest.m3u8'
	)

	// Video Options
	.addOption(
		new Option('--video-codec <codec>', 'What video codec to encode with')
			.default('libx264')
			.choices(['libx264', 'libx265'])
	)
	.addOption(
		new Option(
			'--video-pixel-format <format>',
			'What pixel format to encode with'
		)
			.default('yuv420p')
			.choices([
				'yuv420p',
				'yuvj420p',
				'yuv422p',
				'yuvj422p',
				'yuv444p',
				'yuvj444p',
				'nv12',
				'nv16',
				'nv21',
				'yuv420p10le',
				'yuv422p10le',
				'yuv444p10le',
				'nv20le',
				'gray',
				'gray10le',
			])
	)
	.addOption(
		new Option(
			'--video-resolutions <resolutions...>',
			'One or more resolutions to output'
		)
			.default([2160, 1440, 1080, 720, 480, 360, 240])
			.implies({ videoBitrates: [], videoProfiles: [], videoLevels: [] })
	)
	.option(
		'--video-bitrates <bitrates...>',
		'One or more bitrates to output in kbps, if not equal to number of resolutions the last value will be repeated',
		[18000, 10000, 6000, 3000, 1500, 800, 600]
	)
	.option(
		'--video-profiles <profiles...>',
		'One or more profiles to output, if not equal to number of resolutions the last value will be repeated',
		['high', 'high', 'high', 'high', 'high', 'main', 'main']
	)
	.option(
		'--video-levels <levels...>',
		'One or more profiles to output, if not equal to number of resolutions the last value will be repeated',
		['5.2', '5.2', '5.1', '4.2', '4.0', '3.1', '3.1']
	)

	// Audio options
	.addOption(
		new Option('--audio-codec <codec>', 'Audio codec to use')
			.default('aac')
			.choices(['aac', 'flac', 'ac3', 'eac3'])
	)
	.addOption(
		new Option(
			'--audio-profile <profile>',
			'Profile to use for AAC (when enabled)'
		)
			.default('aac_low')
			.choices(['aac_low', 'mpeg2_aac_low', 'aac_ltp', 'aac_main'])
	)
	.option(
		'--audio-bitrate <bitrate>',
		'Bitrate to use for audio encoding in kbps',
		256
	)

	// Timeline previews
	.option(
		'--timeline-preview-sprite-columns <number>',
		'Number of images to use per row in final sprite',
		6
	)
	.option(
		'--timeline-preview-tile-height <pixels>',
		'Height of each generated thumbnail in pixels',
		144
	)
	.option(
		'--timeline-preview-interval-min <seconds>',
		'Minimum interval between preview frames in seconds before reducing image count',
		1
	)
	.option(
		'--timeline-preview-interval-max <seconds>',
		'Maximum interval between preview frames in seconds before increasing image count',
		5
	)
	.option(
		'--timeline-preview-max-images <number>',
		'Maximum number of images to generate in the final sprite. Once this limit is reached, frames will become more spaced out',
		180
	)

	// Generic options
	.addOption(
		new Option(
			'--image-format <format>',
			'What format to output posters and preview sprites in'
		)
			.default('webp')
			.choices(['webp', 'jpeg', 'avif'])
	)
	.option(
		'--preserve-dirs-from <root>',
		'If set, constructs the output directories using the path of the input file, relative to <root>'
	)
	.option(
		'--count-frames',
		`Force ffprobe to count all the frames for each input ${kleur
			.dim()
			.italic('(might take a long time)')}`
	)
	.option(
		'--no-audio',
		`Mute audio in output file ${kleur
			.dim()
			.italic("(only valid if there's video)")}`
	)
	.option(
		'--no-hls',
		'Skip output of an HLS package (helpful to create a fallback or timeline preview sprite seperately)'
	)
	.option(
		'--no-fallback',
		'Skip creating a progressive MP4 at 720p or lower resolution'
	)
	.option(
		'--no-timeline-previews',
		'Skip creating timeline previews and mosaic'
	)
	.option('--overwrite', 'Force mkhls to overwrite files in output directory')
	.option('-d, --dry-run', "Don't write any files to the filesystem")
	.option('-s, --silent', "Don't output anything")
	.option('-v, --verbose', 'Output additional information')
	.version(pkg.version)
	.helpOption('-h, --help', 'show this help message')
	.configureHelp({
		helpWidth: 100,
	});

program.parse(process.argv);

export default {
	pkg,
	opts: program.opts(),
	args: program.args,
};
