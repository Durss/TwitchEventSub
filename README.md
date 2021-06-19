# Twitch standalone EventSub server

## First steps
### NGrok
Create an account on https://ngrok.com and get an auth token. Works with a free account.
Set it as the **NGROK_AUTH_TOKEN** value.

### Twitch app
1. Create a twitch application here https://dev.twitch.tv/console.\
\
Get the Client ID and the Secret Client and set these values on the **TWITCH_CLIENT_ID** and **TWITCH_CLIENT_SECRET** vars.\
On the app you must also configure a OAuth redirect URI. Depending on the port you configured on the **SERVER_PORT** var it will be this URL :\
`http://localhost:3000/oauth`

2. Define the events you want to subscribe to on the **EVENTS_TO_SUB_TO** var.\
See full events list here :\
https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types


3. Find you twitch user ID and set it on the **TWITCH_BROADCASTER_ID** var.\
You can get your twitch ID from your twitch name via [this page](https://www.streamweasels.com/support/convert-twitch-username-to-user-id/).

4. Finally, you must define the scopes that your twitch app will be granted access to in the **TWITCH_SCOPES** var.\
The avaiable scopes are described on every event's descriptions of [this page](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types).

## Install dependencies
Run the following command on the folder's root :
```
npm install
```

## Run server
Once you configured everything as listed above, just run the server :
```
node index.js
```

On first run the console should log an URL to authorize the app with specified scopes
