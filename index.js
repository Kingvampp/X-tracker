require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { TwitterApi } = require('twitter-api-v2');

// More verbose logging of environment variables
console.log('Starting bot with following config:');
console.log('Discord Token exists:', !!process.env.DISCORD_TOKEN);
console.log('Twitter Key exists:', !!process.env.TWITTER_CONSUMER_KEY);

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Channel]
});

// Initialize Twitter client with error handling
let twitterClient;
try {
    twitterClient = new TwitterApi({
        appKey: process.env.TWITTER_CONSUMER_KEY,
        appSecret: process.env.TWITTER_CONSUMER_SECRET,
        accessToken: process.env.TWITTER_ACCESS_TOKEN,
        accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
    });
    console.log('Twitter client initialized successfully');
} catch (error) {
    console.error('Error initializing Twitter client:', error);
}

// When Discord bot is ready
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} servers`);
    console.log('Bot is ready to respond to commands!');
});

// Error handling for Discord client
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Handle Discord messages
client.on('messageCreate', async message => {
    console.log('Message received:', message.content);
    
    if (message.author.bot) return;
    
    if (message.content === '!ping') {
        try {
            await message.reply('Pong! 🏓');
            console.log('Successfully responded to ping');
        } catch (error) {
            console.error('Error responding to ping:', error);
        }
    }

    if (message.content.startsWith('!tweet ')) {
        const tweetContent = message.content.slice(7);
        try {
            const tweet = await twitterClient.v2.tweet(tweetContent);
            console.log('Tweet posted successfully:', tweet);
            message.reply(`Tweet posted successfully! https://twitter.com/user/status/${tweet.data.id}`);
        } catch (error) {
            console.error('Error posting tweet:', error);
            message.reply('Sorry, there was an error posting your tweet. Error: ' + error.message);
        }
    }
});

// Login with verbose error handling
console.log('Attempting to log in to Discord...');
client.login(process.env.DISCORD_TOKEN)
    .then(() => {
        console.log('Login successful!');
    })
    .catch(error => {
        console.error('Login failed:', error);
        process.exit(1);  // Exit if login fails
    });

// Handle process errors
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

console.log('Environment variables loaded:', {
    twitterKey: !!process.env.TWITTER_CONSUMER_KEY,
    discordToken: !!process.env.DISCORD_TOKEN
}); 