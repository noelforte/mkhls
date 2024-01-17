import cli from '../lib/cli.js';

/**
 * Calculates the number of timeline preview frames to generate based
 * on a given duration and CLI options
 * @param {number} duration Duration of content to calculate specs from
 * @returns {{frames: number, interval: number}}
 */
function getTimelinePreviewSpecs(duration) {
	// Destructure options
	const {
		timelinePreviewIntervalMin: intMin,
		timelinePreviewIntervalMax: intMax,
		timelinePreviewMaxImages: maxImgs,
	} = cli.opts;

	// Initialize frames to be the maximum number of images
	let frameCount = maxImgs;

	// Run a series of conditions to see if that number can be reduced
	if (duration <= intMin * 60) frameCount = duration / intMin;
	else if (duration <= intMax * 60) frameCount = 60;
	else if (duration <= intMax * maxImgs) frameCount = duration / intMax;

	return {
		frames: frameCount,
		interval: duration / frameCount,
	};
}

export default getTimelinePreviewSpecs;
