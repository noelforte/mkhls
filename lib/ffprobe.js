// Use `ffprobe` to get data about input file
import cli from './cli.js';
import logger from '../utils/logger.js';
import cp from 'node:child_process';

export default (source) => {
	const probeArgs = [
		// Logging
		'-hide_banner',
		'-loglevel',
		'fatal',

		// Make sure the returned data shows select items
		'-show_format',
		'-show_streams',

		// Format output as JSON
		'-print_format',
		'json',
	].filter(Boolean);

	// Count frames if --count-frames is specified
	if (cli.opts.countFrames) {
		logger('event', 'Getting file data with `-count_frames`, sit tight!');
		probeArgs.push('-count_frames');
	}

	const data = JSON.parse(
		cp.spawnSync('ffprobe', [...probeArgs, source]).stdout.toString(),
		(key, value) => {
			if (typeof value === 'string' && value.match(/^[\d.]+$/)) {
				return Number(value);
			}

			return value;
		}
	);

	// Select streams
	const streams = {
		video: data.streams.find((stream) => stream.codec_type === 'video'),
		audio: data.streams.find((stream) => stream.codec_type === 'audio'),
	};

	if (!streams.video.nb_frames && !streams.video.nb_read_frames) {
		throw new Error(
			"Couldn't get an accurate frame count from file header. Retry with --count-frames"
		);
	}

	// Compute FPS And
	const fpsDecimal = streams.video.r_frame_rate
		.split('/')
		.reduce((a, b) => a / b);
	const prettyFPS = fpsDecimal.toString().replace(/(\d+\.[^0]+)\d+/, '$1');

	logger(
		'info,stats',
		`Total media duration: ~${Number(data.format.duration).toFixed(3)}s`
	);

	if (streams.video) {
		logger(
			'info,stats',
			`Selected video stream at index ${streams.video.index}:`,
			`${streams.video.width}x${streams.video.height}`,
			`@ ${prettyFPS}fps`
		);
	} else {
		logger('warn', `no video tracks available in ${source}`);
	}

	if (streams.audio) {
		logger(
			'info,stats',
			`Selected audio stream at index ${streams.audio.index}:`,
			`${streams.audio.channels}ch`,
			`@ ${streams.audio.sample_rate}Hz`
		);
	} else {
		logger('warn', `no audio tracks available in ${source}`);
	}

	return {
		streams,
		format: data.format,
		fpsDecimal,
		frameCount: streams.video.nb_frames || streams.video.nb_read_frames,
	};
};
