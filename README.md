# Twitch standalone EventSub server
This is a single-file standalone app to subscribe to EventSub twitch API.\
Just fill-in the IDs as described bellow and run the server.\
Check the console's logs, you may be asked to open an URL on your browser to grant access to configured scopes to your app the first time you run the server.\
Just do anything you want on the `onEvent()` method. This is the function that'll be called everytime twitch sends an event.

## Install dependencies
Run the following command on the folder's root :
```
npm install
```

## Accounts settings
### NGrok
Create an account on https://ngrok.com and get an auth token. Works with a free account.\
Set the token as the `NGROK_AUTH_TOKEN` var value.

### Twitch app
1. Create a twitch application here https://dev.twitch.tv/console. \
\
Get the Client ID and the Secret Client and set these values on the `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` vars.\
On the app you must also configure an OAuth redirect URI.\
Configure this URL:\
`http://localhost:3000/oauth`\
*(make sure the port is the same as the one configured on the var `SERVER_PORT`)*

2. Define the events you want to subscribe to on the `EVENTS_TO_SUB_TO` var.\
See full events list here :\
https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types


3. Set your twitch user ID on the `TWITCH_BROADCASTER_ID` var.\
You can get your twitch ID from your twitch name via [this page](https://www.streamweasels.com/support/convert-twitch-username-to-user-id/).

4. Define a `TWITCH_EVENTSUB_SECRET` key, between 10 and 100 chars. Just write anything you want as a value. Anything genitally related will do 😏.

5. Finally, you must define the scopes that your twitch app will be granted access to in the `TWITCH_SCOPES` var.\
The available scopes are described on every event's descriptions of [this page](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types).

## Run server
Once you configured everything listed above, just run the server :
```
node index.js
```

On first run the console should log an URL to authorize the app with specified scopes.\
Open this URL on your browser, click "accept", your app will then be granted access.\
If you later request a new scope/event, the same message will be displayed.
