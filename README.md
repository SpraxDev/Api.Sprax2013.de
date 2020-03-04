# Api.Sprax2013.de [![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=ncloc)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de) [![Discord-Chat](https://img.shields.io/discord/344982818863972352?label=Discord&logo=discord&logoColor=white)](https://sprax.me/discord)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=alert_status)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de) [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=security_rating)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de) [![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=duplicated_lines_density)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de)

Api.Sprax2013.de or *SpraxAPI* for short is a collection of different APIs used by and for my projects.

You currently can request all sort of Minecraft related things without hitting any rate limitations.
My API achieves this thanks to CloudFlare and internal caching of responses. Additionally, you can request processed version of this data. For example Skins upgraded to the 1.8 format (64x64 pixels) or a rendered Version of it (3D coming soon!).


### Another API for Minecraft?
Yes, but did you use any of the known other ones? Only allowing UUIDs, caching for multiple minutes not allowing for accurate data in some use cases? Or even response times and raw body size?

They are not bad but they could be better. So I'm offering a public and Open Source Version of it, trying to not cause too much traffic (Mojang has to pay bills too!) while providing an helpful and easy to use API.

I'm currently working on SkinDB. It will make great use of this API and provide an intuitive interface for people who don't want to use this API or don't know how.


### What about privacy?
It aims to be highly transparent to everyone.
Thanks to this transparency it is easily compliant with most data protection laws e.g. the **[GDPR](https://en.wikipedia.org/wiki/General_Data_Protection_Regulation)**.

This API provides data in JSON format. I can't even display an ad in some corner if I wanted to. *(consider supporting me on [Patreon](https://www.patreon.com/bePatron?u=11714503&redirect_uri=https%3A%2F%2Fgithub.com%2FSprax2013%2FApi.Sprax2013.de))*


## Setup
**You'll need [Node.js and npm](https://nodejs.org/en/download/package-manager/) on your machine and a PostgreSQL instance**

1. ~~Prepare your PostgreSQL server by running the commands inside `./tables.sql`~~ (coming soon)
2. `npm install`
3. `npm run compile`
4. `npm run start`
4. Configure all files inside `./storage` (automatically generated)
6. Type `rs` into the console or restart the process

<!--
## Contributors ✨
<table>
  <tr>
    <td align="center"><a href="https://github.com/JonasAlpha"><img src="https://avatars1.githubusercontent.com/u/35976079?s=460&v=4" width="100px" alt=""><br><sub><b>Jonas</b></sub></a><br>🎨 Logo and Banner</td>
  </tr>
</table>
-->

## License
[MIT License](./LICENSE)

[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FSprax2013%2FApi.Sprax2013.de.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2FSprax2013%2FApi.Sprax2013.de?ref=badge_large)
