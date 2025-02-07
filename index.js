require('dotenv').config();

console.log('Bot is starting...');

// Your bot code here
// This is just a minimal example to test deployment
console.log('Environment variables loaded:', {
    twitterKey: !!process.env.TWITTER_CONSUMER_KEY,
    discordToken: !!process.env.DISCORD_TOKEN
}); 