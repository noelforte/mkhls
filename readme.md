# mkhls

Uses [`commander`](https://www.npmjs.com/package/commander) and [`ffmpeg`](https://ffmpeg.org/) under the hood to generate everything you need to self-host an Apple HLS stream. Designed with [vidstack](https://www.vidstack.io/)'s player features in mind.

Full output of help text until more concrete documentation is written:

```console
Usage: mkhls [options] <files...>

Arguments:
  files                                       One or more files to process

Options:
  -o, --output <path>                         Path to directory to output the packaged files
                                              (default: (same as input))
  --output-prefix <path>                      Optional prefix to amend to output and prepend to
                                              URLs in the VTT files with. Useful for hosting files
                                              under a base path. (default: "")
  --hls-type <type>                           What type of HLS files should be encoded (choices:
                                              "mpegts", "fmp4", default: "mpegts")
  --hls-interval <interval>                   Length of HLS segements to encode in seconds
                                              (default: 4)
  --hls-segment-name <name>                   Output segment name template to use. Available
                                              placeholders are {stream} (the name of the stream)
                                              and {index} (the segment index). (default:
                                              "{stream}/segment_{index}")
  --hls-root-playlist-name <name>             Filename of the root/main playlist file (default:
                                              "manifest.m3u8")
  --video-codec <codec>                       What video codec to encode with (choices: "libx264",
                                              "libx265", default: "libx264")
  --video-pixel-format <format>               What pixel format to encode with (choices: "yuv420p",
                                              "yuvj420p", "yuv422p", "yuvj422p", "yuv444p",
                                              "yuvj444p", "nv12", "nv16", "nv21", "yuv420p10le",
                                              "yuv422p10le", "yuv444p10le", "nv20le", "gray",
                                              "gray10le", default: "yuv420p")
  --video-resolutions <resolutions...>        One or more resolutions to output (default:
                                              [2160,1440,1080,720,480,360,240])
  --video-bitrates <bitrates...>              One or more bitrates to output in kbps, if not equal
                                              to number of resolutions the last value will be
                                              repeated (default:
                                              [18000,10000,6000,3000,1500,800,600])
  --video-profiles <profiles...>              One or more profiles to output, if not equal to
                                              number of resolutions the last value will be repeated
                                              (default:
                                              ["high","high","high","high","high","main","main"])
  --video-levels <levels...>                  One or more profiles to output, if not equal to
                                              number of resolutions the last value will be repeated
                                              (default:
                                              ["5.2","5.2","5.1","4.2","4.0","3.1","3.1"])
  --audio-codec <codec>                       Audio codec to use (choices: "aac", "flac", "ac3",
                                              "eac3", default: "aac")
  --audio-profile <profile>                   Profile to use for AAC (when enabled) (choices:
                                              "aac_low", "mpeg2_aac_low", "aac_ltp", "aac_main",
                                              default: "aac_low")
  --audio-bitrate <bitrate>                   Bitrate to use for audio encoding in kbps (default:
                                              256)
  --timeline-preview-sprite-columns <number>  Number of images to use per row in final sprite
                                              (default: 6)
  --timeline-preview-tile-height <pixels>     Height of each generated thumbnail in pixels
                                              (default: 144)
  --timeline-preview-interval-min <seconds>   Minimum interval between preview frames in seconds
                                              before reducing image count (default: 1)
  --timeline-preview-interval-max <seconds>   Maximum interval between preview frames in seconds
                                              before increasing image count (default: 5)
  --timeline-preview-max-images <number>      Maximum number of images to generate in the final
                                              sprite. Once this limit is reached, frames will
                                              become more spaced out (default: 180)
  --image-format <format>                     What format to output posters and preview sprites in
                                              (choices: "webp", "jpeg", "avif", default: "webp")
  --preserve-dirs-from <root>                 If set, constructs the output directories using the
                                              path of the input file, relative to <root>
  --count-frames                              Force ffprobe to count all the frames for each input
                                              (might take a long time)
  --no-audio                                  Mute audio in output file (only valid if
                                              there's video)
  --no-hls                                    Skip output of an HLS package (helpful to create a
                                              fallback or timeline preview sprite seperately)
  --no-fallback                               Skip creating a progressive MP4 at 720p or lower
                                              resolution
  --no-timeline-previews                      Skip creating timeline previews and mosaic
  --overwrite                                 Force mkhls to overwrite files in output directory
  -d, --dry-run                               Don't write any files to the filesystem
  -s, --silent                                Don't output anything
  -v, --verbose                               Output additional information
  -V, --version                               output the version number
  -h, --help                                  show this help message
```
