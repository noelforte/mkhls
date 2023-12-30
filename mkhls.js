#!/usr/bin/env node

/**
 * Port of https://github.com/vincentbernat/video2hls to NodeJS
 *
 * Convert a video into a set of files to play it using HLS.
 *
 * The video will be converted to different resolutions, using different
 * bitrates. A master playlist will be generated to be processed by an
 * HLS client. A progressive MP4 version is also produced (to be used as
 * a fallback), as well as a poster image.
 *
 * There are many options, but not all of them are safe to change. For
 * example, HLS is usually expecting AAC-LC as a codec for audio. This
 * can be changed, but this may not work in all browsers.
 *
 * One important option is ``--hls-type``. Choosing ``fmp4`` is more
 * efficient but is only compatible with iOS 10+.
 *
 * Most video options take several parameters (space-separated). When all
 * options do not have the same length, the length of ``--video-widths`` is
 * used to normalize all lengths. Last value is repeated if needed.
 *
 * The ``--video-overlay`` enables to overlay a text with technical
 * information about the video on each video. The value is a pattern like
 * ``{resolution}p``. The allowed variables in pattern are the ones specified
 * as a video option. Same applies for ``--mp4-overlay``.
 *
 * The audio options are global as audio need to be switched seamlessly
 * between segments and it is not possible when using different bitrates
 * or options. The ``--audio-only`` option is like adding a video width
 * of 0 at the end of the video width list. The ``--audio-separate`` will
 * encode the audio track separately from the video (less bandwidth).
 *
 * The default output directory is the basename of the input video.
 */

// Import modules

// Define settings
const encodeSettings = {
  audio: {
    bitrate: '128k',
  },
  video: {
    fallbackMp4: {
      height: 720,
      bitrate: '2500k',
    },
    resolutions: [
      {
        height: 1080,
        bitrate: '6000k',
      },
      {
        height: 720,
        bitrate: '3000k',
      },
      {
        height: 480,
        bitrate: '1500k',
      },
      {
        height: 360,
        bitrate: '800k',
      },
      {
        height: 240,
        bitrate: '600k',
      },
    ],
  },
  mosaic: {
    interval: 1,
    tileHeight: 135,
  },
};
