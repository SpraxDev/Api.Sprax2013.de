# Api.Sprax2013.de [![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/Sprax2013/Api.Sprax2013.de.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/Sprax2013/Api.Sprax2013.de/context:javascript) [![Total alerts](https://img.shields.io/lgtm/alerts/g/Sprax2013/Api.Sprax2013.de.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/Sprax2013/Api.Sprax2013.de/alerts/)

# Setting up / Update
## [SkinDB-Route] yggdrasil_session_pubkey.der
In case Mojang does ever change their public key, you'll need to update the local copy of the public key

Download the latest [authlib](https://libraries.minecraft.net/com/mojang/authlib/1.5.25/authlib-1.5.25.jar) from Mojang and extract the public key from it. Then run `openssl rsa -pubin -in yggdrasil_session_pubkey.der -inform DER -outform PEM -out yggdrasil_session_pubkey.pem` to get an `.pem` file.

## Special Thanks To
**[@NudelErde](https://github.com/NudelErde)** for providing a 3D-SkinRender functionality
