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

/**
 * @typedef {'<HH:MM:SS.sss>'} Timestamp A string containing a timestamp in the format of `<hours>:<minutes>:<seconds>.<milliseconds>`
 * @typedef {'<Number>'} NumberString A string that can be evaluated as coerced to a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number#number_coercion Number}.
 */
const convertTime = {
	/**
	 * Converts a timestamp into seconds
	 * @param {(Timestamp|NumberString|Number)} ts
	 * @returns {Number}
	 */
	toSeconds(ts) {
		if (typeof ts === 'number' || ts.match(/[\d.]+/)) {
			return Number(ts);
		}

		return ts.split(':').reduce((total, current, index) => {
			if (index === 0) current = Number(current * 3600);
			else if (index === 1) current = Number(current * 60);
			else current = Number(current);

			return total + current;
		}, 0);
	},

	/**
	 * Converts seconds into timestamp
	 * @param {(Number|NumberString)} seconds
	 * @returns {Timestamp} A formatted {@link Timestamp}
	 */
	toTimestamp(seconds) {
		seconds = Number(seconds);
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60)
			.toString()
			.padStart(2, '0');
		const s = Math.floor(seconds % 60)
			.toString()
			.padStart(2, '0');
		const ms = (seconds % 1).toFixed(3).replace('0.', '');

		return `<${h}:${m}:${s}.${ms}>`;
	},
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

// Export everything
export { logger, convertTime };
