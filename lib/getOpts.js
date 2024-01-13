import getArgs from './getArgs.js';

export default {
	positionals: getArgs.positionals,
	...getArgs.values,
	hls: {
		type: 'mpegts',
		interval: 6,
		segmentName: '{stream}/segment_{index}',
		mainPlaylist: 'manifest.m3u8',
		noCodecs: true,
	},
	video: {
		codec: 'libx264',
		pixelFormat: 'yuv420p',
		resolutions: [
			{ height: 2160, bitrate: '18000k', profile: 'high@5.2' },
			{ height: 1440, bitrate: '10000k', profile: 'high@5.2' },
			{ height: 1080, bitrate: '6000k', profile: 'high@5.1' },
			{ height: 720, bitrate: '3000k', profile: 'high@4.2' },
			{ height: 480, bitrate: '1500k', profile: 'high@4.0' },
			{ height: 360, bitrate: '800k', profile: 'main@3.1' },
			{ height: 240, bitrate: '600k', profile: 'main@3.1' },
		],
	},
	audio: {
		mute: false,
		codec: 'aac',
		profile: 'aac_low',
		bitrate: '256k',
	},
	mosaic: {
		imagesPerRow: 6,
		tileheight: 144,
		minInterval: 1,
		maxInterval: 10,
		maxImages: 180,
	},
};
