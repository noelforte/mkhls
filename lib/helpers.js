import process from 'node:process';

import { execa } from 'execa';
import kleur from 'kleur';

import getArgs from './getArgs.js';

const { values: opts } = getArgs;

const padField = (field, padding) => String(field).padStart(padding, '0');
const getTimestamp = () => {
	const date = new Date();
	return `${padField(date.getHours(), 2)}:${padField(
		date.getMinutes(),
		2
	)}:${padField(date.getSeconds(), 2)}.${padField(date.getMilliseconds(), 3)}`;
};

const convertTimestampToSeconds = (timestamp) => {
	if (typeof timestamp === 'number') {
		return timestamp;
	}

	if (timestamp.indexOf(':') === -1 && timestamp.indexOf('.') >= 0) {
		return Number(timestamp);
	}

	const timeUnits = timestamp.split(':');

	let secs = Number(timeUnits.pop());

	if (timeUnits.length) {
		secs += Number(timeUnits.pop()) * 60;
	}

	if (timeUnits.length) {
		secs += Number(timeUnits.pop()) * 3600;
	}

	return secs;
};

const convertSecondsToTimestamp = (seconds) => {
	const ms = (seconds % 1).toFixed(3).replace('0.', '');
	const s = Math.floor(seconds % 60)
		.toString()
		.padStart(2, '0');
	const m = Math.floor((seconds % 3600) / 60)
		.toString()
		.padStart(2, '0');
	const h = Math.floor(seconds / 3600);

	return `${h}:${m}:${s}.${ms}`;
};

// Logging function
const logger = (meta, ...messages) => {
	// Set up timestamp object and level
	const [level, cmd] = meta.split(',');

	if (opts.silent || (level === 'info' && !opts.verbose)) return;

	const levelMap = {
		info: 'blue',
		event: 'green',
		warn: 'yellow',
		error: 'red',
	};

	messages
		.join(' ')
		.split('\n')
		.forEach((message) => {
			console.log(
				kleur[levelMap[level]](
					`[${getTimestamp()}] ${cmd ? `${cmd}: ${message}` : message}`
				)
			);
		});
};

/**
 * Command function
 * @param {string} program
 * @param {array} args
 * @param {boolean} fileDuration
 */

const cmd = (program, args, fileDuration) => {
	// Flatten arguments list filter void items, join with spaces
	// and then split by spaces to create a valid argument list
	const argList = args.flat(Infinity).filter(Boolean);

	const execaProcess = execa(program, argList, {
		verbose: opts.verbose,
	});

	execaProcess.stdout.on('data', (data) => {
		// Convert output to strings
		const output = data.toString();

		// Return early if we're not running ffmpeg
		if (program === 'ffprobe') return;

		// If running ffmpeg and tracking progress, parse output and print it to the console.
		if (program === 'ffmpeg' && fileDuration) {
			const stats = output.split('\n').reduce((statsObject, currentElement) => {
				const prop = currentElement.split('=');
				statsObject[prop[0]] = prop[1];
				return statsObject;
			}, {});

			const percentage =
				(
					(Number(convertTimestampToSeconds(stats.out_time)) /
						Number(fileDuration)) *
					100
				).toFixed() + '%';

			process.stdout.clearLine(0);
			process.stdout.cursorTo(0);
			process.stdout.write(`Running '${program}' ... ${percentage}`);

			return;
		}

		logger(`info,${program}`, output);
	});

	// Handle error output
	execaProcess.stderr.on('data', (data) => {
		const output = data.toString();
		logger(`error,${program}`, output);
	});

	// Handle process closure
	execaProcess.on('close', () => {
		process.stdout.write(`\n`);
	});

	return execaProcess;
};

// Export everything
export { logger, cmd, convertSecondsToTimestamp, convertTimestampToSeconds };
