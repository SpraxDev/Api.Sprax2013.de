# Api.Sprax2013.de [![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/Sprax2013/Api.Sprax2013.de.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/Sprax2013/Api.Sprax2013.de/context:javascript) [![Total alerts](https://img.shields.io/lgtm/alerts/g/Sprax2013/Api.Sprax2013.de.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/Sprax2013/Api.Sprax2013.de/alerts/) [![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FSprax2013%2FApi.Sprax2013.de.svg?type=shield)](https://app.fossa.io/projects/git%2Bgithub.com%2FSprax2013%2FApi.Sprax2013.de?ref=badge_shield)

# Setting up / Update
## [SkinDB-Route] yggdrasil_session_pubkey.der
You have to download the public key used by [Yggdrasil](https://minecraft.gamepedia.com/Yggdrasil)

Download the latest [authlib](https://libraries.minecraft.net/com/mojang/authlib/1.5.25/authlib-1.5.25.jar) from Mojang and extract the public key from it. Then run `openssl rsa -pubin -in yggdrasil_session_pubkey.der -inform DER -outform PEM -out yggdrasil_session_pubkey.pem` to get an `.pem` file.

Save this `.pem` file as `./storage/static/yggdrasil_session_pubkey.pem`

## Special Thanks To
**[@NudelErde](https://github.com/NudelErde)** for providing a 3D-SkinRender functionality


## License
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FSprax2013%2FApi.Sprax2013.de.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FSprax2013%2FApi.Sprax2013.de?ref=badge_large)
