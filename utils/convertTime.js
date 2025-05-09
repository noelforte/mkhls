/**
 * @typedef {'<HH:MM:SS.sss>'} Timestamp A string containing a timestamp in the format of `<hours>:<minutes>:<seconds>.<milliseconds>`
 * @typedef {'<Number>'} NumberString A string that can be coerced to a {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number#number_coercion Number}.
 */
const convertTime = {
	/**
	 * Converts a timestamp into seconds.
	 * Credit to {@link https://github.com/fluent-ffmpeg/node-fluent-ffmpeg/blob/master/lib/utils.js#L237-L262 fluent-ffmpeg}
	 * for this method.
	 * @param {(Timestamp|NumberString|number)} ts
	 * @returns {number}
	 */
	toSeconds(ts) {
		if (typeof ts === 'number' || ts.match(/^[\d.]+$/)) {
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
	 * Converts seconds into timestamp. Converts the seconds specified
	 * into a timestamp in the format of HH:MM:SS.sss
	 * @param {(number|NumberString)} seconds
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

		return `${h}:${m}:${s}.${ms}`;
	},
};

export default convertTime;
