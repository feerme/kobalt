import YTDlpWrap from 'yt-dlp-wrap';
import { env } from "../../config.js";
import { getCookie } from "../cookie/manager.js";

const ytDlp = new YTDlpWrap.default();

const videoQualities = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320];

const codecList = {
    h264: {
        videoCodec: "avc1",
        audioCodec: "m4a",
        container: "mp4",
    },
    av1: {
        videoCodec: "av01",
        audioCodec: "opus",
        container: "webm",
    },
    vp9: {
        videoCodec: "vp9",
        audioCodec: "opus",
        container: "webm",
    }
}

const normalizeQuality = (height) => {
    return videoQualities.find(qual => qual >= height) || videoQualities[videoQualities.length - 1];
}

const buildYtDlpArgs = () => {
    const args = [
        '--dump-json',
        '--no-playlist',
        '--no-warnings',
        '--no-check-certificate',
        '--prefer-free-formats',
        '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ];

    // Add cookies if available
    const cookie = getCookie('youtube');
    if (cookie) {
        // yt-dlp-wrap will handle cookie string properly
        args.push('--add-header', `Cookie: ${cookie}`);
    }

    return args;
}

export default async function (o) {
    const quality = o.quality === "max" ? 9000 : Number(o.quality);
    const codec = o.codec || "h264";
    const videoId = o.id;
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
        const args = buildYtDlpArgs();

        // Get video info
        let info;
        try {
            const output = await ytDlp.execPromise([
                videoUrl,
                ...args
            ]);
            info = JSON.parse(output);
        } catch (e) {
            if (e.message?.includes('Private video')) {
                return { error: "content.video.private" };
            }
            if (e.message?.includes('Video unavailable')) {
                return { error: "content.video.unavailable" };
            }
            if (e.message?.includes('age')) {
                return { error: "content.video.age" };
            }
            if (e.message?.includes('available in your country')) {
                return { error: "content.video.region" };
            }
            return { error: "fetch.fail" };
        }

        if (!info) {
            return { error: "fetch.fail" };
        }

        // Check if live
        if (info.is_live) {
            return { error: "content.video.live" };
        }

        // Check duration
        if (info.duration > env.durationLimit) {
            return { error: "content.too_long" };
        }

        // Verify video ID matches
        if (info.id !== videoId) {
            return {
                error: "fetch.fail",
                critical: true
            };
        }

        const fileMetadata = {
            title: info.title?.trim() || "untitled",
            artist: info.uploader?.replace("- Topic", "").trim() || info.channel?.replace("- Topic", "").trim() || "unknown"
        };

        // Extract additional metadata from description if it's a music track
        if (info.description?.startsWith("Provided to YouTube by")) {
            const descItems = info.description.split("\n\n", 5);
            if (descItems.length === 5) {
                fileMetadata.album = descItems[2];
                fileMetadata.copyright = descItems[3];
                if (descItems[4].startsWith("Released on:")) {
                    fileMetadata.date = descItems[4].replace("Released on: ", '').trim();
                }
            }
        }

        const filenameAttributes = {
            service: "youtube",
            id: videoId,
            title: fileMetadata.title,
            author: fileMetadata.artist,
        };

        // Handle audio-only downloads
        if (o.isAudioOnly) {
            const audioFormats = info.formats?.filter(f =>
                f.acodec !== 'none' &&
                f.vcodec === 'none' &&
                f.url &&
                !f.url.includes('.m3u8') &&
                !f.url.includes('/manifest/hls')
            ).sort((a, b) => (b.abr || 0) - (a.abr || 0));

            if (!audioFormats?.length) {
                return { error: "youtube.no_matching_format" };
            }

            // Default to original audio (highest language_preference or check URL for acont=original)
            const bestAudioFormat = audioFormats.find(f =>
                (f.language_preference !== undefined && f.language_preference > 0) ||
                f.url?.includes('acont%3Doriginal')
            ) || audioFormats[0];

            let bestAudio = bestAudioFormat.ext === 'webm' ? 'opus' : 'm4a';
            let audioUrl = bestAudioFormat.url;

            // Handle dubbed language if specified
            if (o.dubLang && info.formats) {
                const dubbedAudio = info.formats.find(f =>
                    f.acodec !== 'none' &&
                    f.vcodec === 'none' &&
                    f.url &&
                    !f.url.includes('.m3u8') &&
                    f.language?.startsWith(o.dubLang)
                );

                if (dubbedAudio) {
                    audioUrl = dubbedAudio.url;
                    bestAudio = dubbedAudio.ext === 'webm' ? 'opus' : 'm4a';
                    filenameAttributes.youtubeDubName = dubbedAudio.language;
                }
            }

            // Get thumbnail
            let cover = info.thumbnail || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

            return {
                type: "audio",
                isAudioOnly: true,
                urls: audioUrl,
                filenameAttributes,
                fileMetadata,
                bestAudio,
                isHLS: false,
                originalRequest: {
                    ...o,
                    dispatcher: undefined,
                },
                cover,
                cropCover: (info.uploader || info.channel || "").endsWith("- Topic"),
            };
        }

        // Handle video downloads
        const codecInfo = codecList[codec] || codecList.h264;

        // Filter formats by codec, excluding HLS manifests and formats without direct URLs
        const videoFormats = info.formats?.filter(f => {
            if (f.vcodec === 'none') return false;
            if (!f.url) return false;

            // Exclude HLS manifests - we need direct progressive formats
            if (f.url?.includes('.m3u8') || f.url?.includes('/manifest/hls')) return false;

            // Check video codec
            if (codec === 'h264' && !f.vcodec?.includes('avc')) return false;
            if (codec === 'av1' && !f.vcodec?.includes('av01')) return false;
            if (codec === 'vp9' && !f.vcodec?.includes('vp9')) return false;

            return true;
        }).sort((a, b) => {
            // Sort by resolution, then by bitrate
            const heightDiff = (b.height || 0) - (a.height || 0);
            if (heightDiff !== 0) return heightDiff;
            return (b.tbr || 0) - (a.tbr || 0);
        });

        const audioFormats = info.formats?.filter(f =>
            f.acodec !== 'none' && f.vcodec === 'none' && f.url && !f.url.includes('.m3u8')
        ).sort((a, b) => (b.abr || 0) - (a.abr || 0));

        if (!videoFormats?.length || !audioFormats?.length) {
            return { error: "youtube.no_matching_format" };
        }

        // Select video format based on quality
        let selectedVideo;
        if (quality === 9000) {
            selectedVideo = videoFormats[0]; // Best quality
        } else {
            selectedVideo = videoFormats.find(f => normalizeQuality(f.height) === quality)
                || videoFormats.find(f => f.height <= quality)
                || videoFormats[videoFormats.length - 1];
        }

        // Default to original audio (highest language_preference or check URL for acont=original)
        let selectedAudio = audioFormats.find(f =>
            (f.language_preference !== undefined && f.language_preference > 0) ||
            f.url?.includes('acont%3Doriginal')
        ) || audioFormats[0];

        // Handle dubbed language if specified
        if (o.dubLang && info.formats) {
            const dubbedAudio = info.formats.find(f =>
                f.acodec !== 'none' &&
                f.vcodec === 'none' &&
                f.url &&
                !f.url.includes('.m3u8') &&
                f.language?.startsWith(o.dubLang)
            );

            if (dubbedAudio) {
                selectedAudio = dubbedAudio;
                filenameAttributes.youtubeDubName = dubbedAudio.language;
            }
        }

        if (!selectedVideo || !selectedAudio) {
            return { error: "youtube.no_matching_format" };
        }

        const resolution = normalizeQuality(selectedVideo.height);

        filenameAttributes.resolution = `${selectedVideo.width}x${selectedVideo.height}`;
        filenameAttributes.qualityLabel = `${resolution}p`;
        filenameAttributes.youtubeFormat = codec;
        filenameAttributes.extension = o.container === "auto" ? codecInfo.container : o.container;

        // Handle subtitles
        let subtitles;
        if (o.subtitleLang && info.subtitles) {
            const availableSubs = info.subtitles[o.subtitleLang] ||
                info.automatic_captions?.[o.subtitleLang];

            if (availableSubs) {
                const vttSub = availableSubs.find(s => s.ext === 'vtt');
                if (vttSub) {
                    subtitles = {
                        url: vttSub.url,
                        language: o.subtitleLang
                    };
                    fileMetadata.sublanguage = o.subtitleLang;
                }
            }
        }

        // Detect if URLs are HLS (shouldn't happen with filtering, but just in case)
        const isHLS = selectedVideo.url?.includes('.m3u8') || selectedAudio.url?.includes('.m3u8');

        return {
            type: "merge",
            urls: [
                selectedVideo.url,
                selectedAudio.url,
            ],
            subtitles: subtitles?.url,
            filenameAttributes,
            fileMetadata,
            isHLS,
            originalRequest: {
                ...o,
                dispatcher: undefined,
            }
        };

    } catch (e) {
        console.error('YouTube yt-dlp error:', e);
        return { error: "fetch.fail" };
    }
}
