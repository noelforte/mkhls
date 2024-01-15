import kleur from 'kleur';
import getArgs from '../lib/getArgs.js';
import getTimestamp from './getTimestamp.js';
const { values: opts } = getArgs;

/**
 * Simple logging utility that wraps `console.log` calls with {@link https://www.npmjs.com/package/kleur kleur}
 *
 * @param {LogFormat} meta
 *
 * @param {string[]} messages
 * An array of messages to pass to the logging utility. Each message will be processed as a seperate line.
 *
 * @typedef {'<level>,<program>'} LogFormat
 * A comma-seperated string specifying `<level>` and `<program>`, where
 * `<level>` is one of `info`, `event`, `warn`, or `error`.
 */
function logger(meta, ...messages) {
	// Set up timestamp object and level
	const [level, cmd] = meta.split(',');

	if (opts.silent || (level === 'info' && !opts.verbose)) return;

	const levelMap = {
		info: 'blue',
		event: 'dim',
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
}

export default logger;
