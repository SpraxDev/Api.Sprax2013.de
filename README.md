# Api.Sprax2013.de ![SpraxAPI Logo](https://cdn.discordapp.com/attachments/611940958568841227/684744018990727178/SpraxAPI-48px.png)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=security_rating)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de)
[![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=ncloc)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de)
[![Discord-Chat](https://img.shields.io/discord/344982818863972352?label=Discord&logo=discord&logoColor=white)](https://sprax.me/discord)


Api.Sprax2013.de or *SpraxAPI* for short is a collection of different public APIs that everyone can use.

SpraxAPI started as a private API in PHP to ensure my projects keep working without hitting the rate limit for some APIs. As soon as I discoverd [Node.js](https://nodejs.org/), I quickly felt confident that my API can handle requests from the public (performance and security). And currently servers over 2,000,000 request a month (as of the 4th May 2020).

You currently can request all sort of Minecraft related things without hitting any rate limitations.
My API achieves this thanks to CloudFlare and internal caching of responses. Additionally, you can request processed version of this data. For example Skins upgraded to the 1.8 format (64x64 pixels) or a (2D/3D) rendered Version of it.

### Another API for Minecraft?
Yes, but did you use any of the known other ones? Only allowing UUIDs, caching for multiple minutes or hours, not allowing for accurate data in some use cases? Or even long response times and huge response body size?

They are not bad but they could be better. So I'm offering a public and Open Source Version alternative, trying to not cause too much traffic (Mojang has to pay bills too!) while providing an helpful and easy to use API.

I'm currently working on SkinDB. It will make great use of this API and provide an intuitive interface for people who don't want to use this API or don't know how.


### What about privacy?
It aims to be highly transparent to everyone.
Thanks to this transparency it is easily compliant with most data protection laws e.g. the **[GDPR](https://en.wikipedia.org/wiki/General_Data_Protection_Regulation)**.

This API provides data in JSON format. I can't even display an ad in some corner if I wanted to. *(consider supporting me on [Patreon](https://www.patreon.com/bePatron?u=11714503&redirect_uri=https%3A%2F%2Fgithub.com%SpraxDev%2FApi.Sprax2013.de))*


## Setup
**You'll need [Node.js and npm](https://nodejs.org/en/download/package-manager/) on your machine and a PostgreSQL instance**

1. ~~Prepare your PostgreSQL server by running the commands inside `./tables.sql`~~ (coming soon)
2. `npm install`
3. `npm run build`
4. `npm run start` or `npm run start-headless` on machines without GPU
4. Configure all files inside `./storage/` (automatically generated)
6. Type `rs` into the console or restart the process

<b>Can't run?</b> You might need to install some dependencies found [here](https://github.com/stackgl/headless-gl#system-dependencies) and [here too](https://github.com/stackgl/headless-gl#how-can-headless-gl-be-used-on-a-headless-linux-machine)

## Setup for development
1. Follow the [Setup](#setup) section until 2nd step.
2. Use `npm run dev` to run without creating an output dir (autorestart on file changes)

## Thanks To... ✨
<table>
  <tr>
    <td>
      <a href="https://github.com/JNSAPH" title="Made and helped with design related stuff">
        <img src="https://avatars3.githubusercontent.com/u/35976079" width="100px" alt="JNSAPH GitHub-Logo"><!--
        --><br><!--
        --><sub>🎨<b>JonasAlpha</b></sub>
      </a>
    </td>
    <td>
      <a href="https://github.com/NudelErde" title="Made 3D rendering possible">
        <img src="https://avatars3.githubusercontent.com/u/37987062" width="100px" alt="NudelErde GitHub-Logo"><!--
        --><br><!--
        --><sub>💻<b>NudelErde</b></sub>
      </a>
    </td>
  </tr>
</table>

<table>
  <tr>
    <td>
      <a href="https://www.cloudflare.com/" title="Improve API performance and availability">
        <img src="https://www.cloudflare.com/img/logo-cloudflare-dark.svg" width="100px" alt="CloudFlare branding"><!--
        --><br><!--
        --><sub><b>CloudFlare Free</b></sub>
      </a>
    </td>
    <td>
      <a href="https://www.jetbrains.com/" title="Provide greate IDEs">
        <img src="https://i.imgur.com/RISnfij.png" width="100px"  alt="JetBrains branding"><!--
        --><br><!--
        --><sub><b>JetBrains OS License</b></sub>
      </a>
    </td>
  </tr>
</table>

## License
[MIT License](./LICENSE)
