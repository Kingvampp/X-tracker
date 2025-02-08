require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { TwitterApi } = require('twitter-api-v2');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel]
});

const twitterClient = new TwitterApi({
    appKey: process.env.TWITTER_CONSUMER_KEY,
    appSecret: process.env.TWITTER_CONSUMER_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
});

const trackedUsers = new Map();

// Solana address pattern
const solanaAddressPattern = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function createJupiterLink(tokenAddress) {
    return `https://jup.ag/swap/SOL-${tokenAddress}`;
}

async function startTracking(username, channelId) {
    try {
        console.log(`Attempting to track @${username} in channel ${channelId}`);
        const user = await twitterClient.v2.userByUsername(username);
        if (!user.data) {
            throw new Error('User not found');
        }

        const userId = user.data.id;
        console.log(`Successfully found user @${username} (ID: ${userId})`);
        
        // Get the most recent tweet to start tracking from there
        const recentTweets = await twitterClient.v2.userTimeline(userId, {
            max_results: 5
        });
        
        const lastTweetId = recentTweets.data?.data?.[0]?.id || null;
        console.log(`Starting tracking from tweet ID: ${lastTweetId}`);

        trackedUsers.set(username.toLowerCase(), {
            userId: userId,
            channelId: channelId,
            lastTweetId: lastTweetId
        });

        checkNewTweets(username.toLowerCase());
        return true;
    } catch (error) {
        console.error(`Error starting tracking for ${username}:`, error);
        return false;
    }
}

async function checkNewTweets(username) {
    const userData = trackedUsers.get(username);
    if (!userData) {
        console.log(`No user data found for ${username}`);
        return;
    }

    try {
        console.log(`Checking tweets for @${username} (ID: ${userData.userId})`);
        const tweets = await twitterClient.v2.userTimeline(userData.userId, {
            exclude: ['retweets'],
            since_id: userData.lastTweetId,
            max_results: 100
        });

        console.log(`Found ${tweets.data?.data?.length || 0} new tweets`);

        for (const tweet of tweets.data?.data || []) {
            console.log(`Processing tweet from @${username}: ${tweet.text}`);
            const solanaAddresses = tweet.text.match(solanaAddressPattern);
            
            if (solanaAddresses) {
                console.log(`Found Solana addresses: ${solanaAddresses.join(', ')}`);
                const channel = await client.channels.fetch(userData.channelId);
                
                const jupiterLinks = solanaAddresses.map(address => ({
                    name: `🚀 Trade ${address.slice(0, 4)}...${address.slice(-4)}`,
                    value: `[Trade on Jupiter](${createJupiterLink(address)})`
                }));

                await channel.send({
                    embeds: [{
                        title: `New Token Alert from @${username}`,
                        description: tweet.text,
                        url: `https://twitter.com/${username}/status/${tweet.id}`,
                        color: 0x1DA1F2,
                        timestamp: new Date(),
                        fields: jupiterLinks,
                        footer: {
                            text: 'Solana Token Alert Bot'
                        }
                    }]
                });
            } else {
                console.log('No Solana addresses found in tweet');
            }
        }

        if (tweets.data?.data?.[0]) {
            userData.lastTweetId = tweets.data.data[0].id;
            console.log(`Updated last tweet ID to: ${userData.lastTweetId}`);
        }

        // Store the updated userData
        trackedUsers.set(username, userData);

        setTimeout(() => checkNewTweets(username), 15000); // Checking every 15 seconds
    } catch (error) {
        console.error(`Error checking tweets for ${username}:`, error);
        setTimeout(() => checkNewTweets(username), 60000);
    }
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'track':
                if (!args.length) {
                    message.reply('Please provide a Twitter username to track! Usage: !track <username>');
                    return;
                }
                const username = args[0].replace('@', '').toLowerCase();
                const success = await startTracking(username, message.channel.id);
                if (success) {
                    message.reply(`Now tracking @${username} for Solana token addresses!`);
                } else {
                    message.reply(`Failed to track @${username}. Please check the username and try again.`);
                }
                break;

            case 'untrack':
                if (!args.length) {
                    message.reply('Please provide a Twitter username to untrack! Usage: !untrack <username>');
                    return;
                }
                const untrackUsername = args[0].replace('@', '').toLowerCase();
                if (trackedUsers.delete(untrackUsername)) {
                    message.reply(`Stopped tracking @${untrackUsername}`);
                } else {
                    message.reply(`Wasn't tracking @${untrackUsername}`);
                }
                break;

            case 'list':
                const tracked = Array.from(trackedUsers.keys());
                if (tracked.length === 0) {
                    message.reply('No accounts are currently being tracked.');
                } else {
                    message.reply({
                        embeds: [{
                            title: 'Tracked Accounts',
                            description: tracked.map(u => `• @${u}`).join('\n'),
                            color: 0x1DA1F2,
                            footer: {
                                text: `Tracking ${tracked.length} accounts`
                            }
                        }]
                    });
                }
                break;

            case 'debug':
                const debugInfo = Array.from(trackedUsers.entries()).map(([username, data]) => 
                    `@${username}: ID=${data.userId}, LastTweet=${data.lastTweetId}, Channel=${data.channelId}`
                ).join('\n');
                message.reply(`Debug Info:\n${debugInfo}`);
                break;

            case 'help':
                message.reply({
                    embeds: [{
                        title: 'Solana Token Alert Bot Commands',
                        description: 'This bot tracks Twitter accounts and alerts when they mention Solana token addresses.',
                        fields: [
                            { name: '!track <username>', value: 'Start tracking a Twitter account for token addresses' },
                            { name: '!untrack <username>', value: 'Stop tracking a Twitter account' },
                            { name: '!list', value: 'List all tracked accounts' },
                            { name: '!debug', value: 'Show debug information' },
                            { name: '!help', value: 'Show this help message' }
                        ],
                        color: 0x0099ff
                    }]
                });
                break;
        }
    } catch (error) {
        console.error(`Error executing command ${command}:`, error);
        message.reply('Sorry, there was an error executing that command.');
    }
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('Tracking Solana tokens | !help', { type: 'WATCHING' });
    
    // Restart tracking for all users
    console.log('Restarting tracking for all users...');
    trackedUsers.forEach((data, username) => {
        checkNewTweets(username);
    });
});

client.login(process.env.DISCORD_TOKEN);