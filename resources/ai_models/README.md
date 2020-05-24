# How to install AI-Models?
1. Create a Project on [Teachable Machine](https://teachablemachine.withgoogle.com/) (free, no login) and Export the trained model for `Tensorflow.js`
2. The exported model is downloaded as `.zip` file. Create a new folder inside `./resources/ai_models/` and copy the individual files from the `.zip` into there
3. You should now have `./resources/ai_models/Your-Model-Name/metadata.json`, `model.json` and `weights.bin`
4. Edit the `metadata.json` and insert `"modelRevision": 0` to the existing JSON. You may want to change the `0` everytime you export a modified version of the model. The application won't use it by itself but you may want to.
5. Start the API and test it by visiting `/skindb/ai/Your-Model-Name` and providing a file (minecraft skin?)


Quick Tipp: The API will notify you on problems via the console.
For example, you can't have the model directories `myAI` and `MyAI` although your system may allow this.
Only one of them is loaded in this case and a error is printed.
