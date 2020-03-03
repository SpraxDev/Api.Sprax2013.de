# Api.Sprax2013.de [![Lines of Code](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=ncloc)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de) [![Discord-Chat](https://img.shields.io/discord/344982818863972352?label=Discord&logo=discord&logoColor=white)](https://sprax.me/discord)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=alert_status)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de) [![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=security_rating)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de) [![Duplicated Lines (%)](https://sonarcloud.io/api/project_badges/measure?project=Sprax2013_Api.Sprax2013.de&metric=duplicated_lines_density)](https://sonarcloud.io/dashboard?id=Sprax2013_Api.Sprax2013.de)

<!--
Mc-Auth-Web is used for [mc-auth.com](https://mc-auth.com). You can easily login with your Minecraft-Account without giving your password or account e-mail away! This way you can securely login to third-party services that use [mc-auth.com](https://mc-auth.com).

It aims to be highly transparent to users **and** developers.
Thanks to this transparency it is easily compliant with most data protection laws e.g. the **[GDPR](https://en.wikipedia.org/wiki/General_Data_Protection_Regulation)**.

### Another Authentificatio Service for Minecraft? Really?
I know there is *[MCAuth](https://github.com/MC-Auth) by inventivetalent* or *[Minecraft oAuth](https://mc-oauth.net/) by Deftware* (and some more) but I wanted something different for my project [SkinDB.net](https://skindb.net).
They look neat and both work, but mentions nowhere what happens with your data (I live inside the EU, so I need to be GDPR compliant!).
Another problem would be that I wanted full oAuth2 implementation. What normally would be done by Mojang as account holders, but they didn't (at least until now).

So I read some [oAuth2 paper](https://tools.ietf.org/html/rfc6749) and started writeing down what [mc-auth.com](https://mc-auth.com) should be able to do and what the user should be able to do.


## Setup
**You'll need [Node.js and npm](https://nodejs.org/en/download/package-manager/) on your machine and a PostgreSQL instance**

1. Prepare your PostgreSQL server by running the commands inside `./tables.sql`
2. `npm install`
3. `npm start`
4. Configure all files inside `./storage` (automatically generated)
5. Edit the first variables of the files `./storage.js` and `./.static/script-login.js`
6. Type `rs` into the console or restart the process
-->

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