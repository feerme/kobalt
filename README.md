<div align="center">
    <br/>
    <p>
        <img src="web/static/favicon.png" title="kobalt" alt="kobalt logo" width="100" />
    </p>
    <p>
        best way to save what you love
        <br/>
        <a href="https://cobalt.tools">
            cobalt.tools
        </a>
    </p>
    <br/>
</div>

kobalt is a media downloader that doesn't piss you off. it's friendly, efficient, and doesn't have ads, trackers, paywalls or other nonsense.

paste the link, get the file, move on. that simple, just how it should be.

> **NOTICE:**
> kobalt is a fork of [cobalt](https://github.com/imputnet/cobalt) focused on the API for archiving/downloading media from social media sites.
> The previous YouTube integration was replaced with a yt-dlp wrapper (https://github.com/yt-dlp/yt-dlp) instead of the original self-implemented solution, because that version was broken and unreliable.
> The web frontend from the original project has been **removed** in this fork because it was not modified in any way.


### kobalt monorepo
this monorepo includes source code for the api and related packages:
- [api tree & readme](/api/)
- [packages tree](/packages/)

it also includes documentation in the [docs tree](/docs/):
- [how to run a kobalt instance](/docs/run-an-instance.md)
- [how to protect a kobalt instance](/docs/protect-an-instance.md)
- [kobalt api instance environment variables](/docs/api-env-variables.md)
- [kobalt api documentation](/docs/api.md)

### ethics
kobalt is a tool that makes downloading public content easier. it takes **zero liability**.
the end user is responsible for what they download, how they use and distribute that content.
kobalt never caches any content, it [works like a fancy proxy](/api/src/stream/).

kobalt is in no way a piracy tool and cannot be used as such.
it can only download free & publicly accessible content.
same content can be downloaded via dev tools of any modern web browser.

### contributing
if you're considering contributing to kobalt, first of all, thank you! check the [contribution guidelines here](/CONTRIBUTING.md) before getting started, they'll help you do your best right away.

### licenses
for relevant licensing information, see the [api](api/README.md) README.
unless specified otherwise, the remainder of this repository is licensed under [AGPL-3.0](LICENSE).