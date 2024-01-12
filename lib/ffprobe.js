// Use `ffprobe` to get data about input file
import { logger } from './helpers.js';
import { execa } from 'execa';

export default async (source) => {
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

		source,
	];

	const data = JSON.parse(
		(await execa('ffprobe', probeArgs)).stdout,
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
	};
};
