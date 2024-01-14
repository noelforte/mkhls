/**
 * Exports a mini-class to handle building an arg list
 * for ffmpeg, uses execa to execute and handle output
 */

// Internals
import path from 'node:path';
import process from 'node:process';

// Externals
import { execa } from 'execa';

// Locals
import ffprobe from './ffprobe.js';
import convertTime from '../utils/convertTime.js';
import logger from '../utils/logger.js';
import getArgs from './getArgs.js';
import kleur from 'kleur';

const { values: opts } = getArgs;

class FFmpeg {
	constructor() {
		this.meta = {};
		this.arglist = [];
	}

	/**
	 * @returns {VideoSpecs}
	 * @typedef {object} VideoSpecs
	 * @property {number} fpsDecimal
	 * @property {object} streams
	 * @property {object} streams.video
	 * @property {object} streams.audio
	 * @property {object} format
	 * Metadata specs as an object */
	get specs() {
		if (Object.keys(this.meta).length === 0) {
			throw new Error(
				'No data to show, did you remember to call `loadMeta()`?'
			);
		}

		return this.meta.data;
	}

	/**
	 * @param {fs.PathLike} input
	 * Path to load data object from */
	async loadMeta(input) {
		const data = await ffprobe(input);
		const parsedPath = path.parse(input);

		const slug = parsedPath.name
			.toLowerCase()
			.replaceAll(/[-_\s]+/g, '-')
			.replaceAll(/[^A-z0-9-]/g, '');

		this.meta = {
			slug,
			data,
			path: parsedPath,
		};
	}

	/**
	 * @param {...string} args
	 * One or more arguments to add */
	addArguments(...args) {
		this.arglist.push(...args);

		return this;
	}

	/**
	 * Path of input to pass to ffmpeg
	 * @param {object} options
	 * Object of ffmpeg options to add. Boolean elements will be added as-is
	 * @example
	 * ```
	 * addArgumentSet('/path/to/input', {
	 *   a: 'value'
	 *   b: ['value1', 'value2']
	 *   '-singleOpt': true
	 * })
	 * //=> ['-a', 'value', '-b', 'value1,value2', '-singleOpt']
	 * ``` */
	addArgumentSet(options) {
		Object.entries(options).forEach(([k, v]) => {
			if (typeof v == 'boolean' && v) {
				this.addArguments(k);
			} else if (typeof v != 'boolean') {
				this.addArguments(`-${k}`, String(v));
			}
		});
		return this;
	}

	/**
	 * @returns {import('execa').ExecaChildProcess}
	 */
	async start() {
		const args = this.arglist.flat(Infinity).filter(Boolean);

		const ffmpegExecaProcess = execa(
			'ffmpeg',
			[
				'-loglevel',
				'error',
				'-hide_banner',
				'-stats_period',
				'0.25',
				'-progress',
				'-',
				...args,
			],
			{
				verbose: opts.verbose,
			}
		);

		ffmpegExecaProcess.stdout.on('data', (data) => {
			// Convert output to strings
			const output = data.toString().match(/out_time=([\d:.]+)/);
			if (output) {
				const percentage =
					(convertTime.toSeconds(output[1]) / this.specs.format.duration) * 100;

				process.stdout.clearLine(0);
				process.stdout.cursorTo(0);
				process.stdout.write(
					`Processing '${this.meta.path.base}' ${percentage.toFixed()}%`
				);
			}
		});

		ffmpegExecaProcess.stderr.on('data', (data) => {
			logger('warn,ffmpeg', data.toString());
		});

		ffmpegExecaProcess.on('exit', (code) => {
			if (code === 0) {
				process.stdout.clearLine(0);
				process.stdout.cursorTo(0);
				process.stdout.write(
					kleur.green(`Processing '${this.meta.path.base}' [COMPLETE]\n`)
				);
			}
		});

		return ffmpegExecaProcess;
	}
}

export default FFmpeg;
