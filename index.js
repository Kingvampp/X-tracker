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

// Store tracked users and their associated channels
const trackedUsers = new Map();

// Solana address regex pattern
const solanaAddressPattern = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

function createJupiterLink(tokenAddress) {
    return `https://jup.ag/swap/SOL-${tokenAddress}`;
}

async function startTracking(username, channelId) {
    try {
        // Get user ID from username
        const user = await twitterClient.v2.userByUsername(username);
        if (!user.data) {
            throw new Error('User not found');
        }

        const userId = user.data.id;
        
        // Store tracking info
        trackedUsers.set(username, {
            userId: userId,
            channelId: channelId,
            lastTweetId: null
        });

        // Start checking for new tweets
        checkNewTweets(username);
        
        return true;
    } catch (error) {
        console.error(`Error starting tracking for ${username}:`, error);
        return false;
    }
}

async function checkNewTweets(username) {
    const userData = trackedUsers.get(username);
    if (!userData) return;

    try {
        const tweets = await twitterClient.v2.userTimeline(userData.userId, {
            exclude: ['retweets'], // Only excluding retweets, including replies
            since_id: userData.lastTweetId
        });

        for (const tweet of tweets.data?.data || []) {
            const channel = await client.channels.fetch(userData.channelId);
            
            // Check for Solana token addresses
            const solanaAddresses = tweet.text.match(solanaAddressPattern);
            let description = tweet.text;
            
            // If Solana addresses found, add Jupiter links
            const jupiterLinks = [];
            if (solanaAddresses) {
                solanaAddresses.forEach(address => {
                    const jupLink = createJupiterLink(address);
                    jupiterLinks.push(`[Trade ${address.slice(0, 4)}...${address.slice(-4)} on Jupiter](${jupLink})`);
                });
            }

            await channel.send({
                embeds: [{
                    title: `New Tweet from @${username}`,
                    description: description,
                    url: `https://twitter.com/${username}/status/${tweet.id}`,
                    color: 0x1DA1F2,
                    timestamp: new Date(),
                    fields: jupiterLinks.length > 0 ? [
                        {
                            name: '🚀 Trade on Jupiter',
                            value: jupiterLinks.join('\n')
                        }
                    ] : []
                }]
            });
        }

        if (tweets.data?.data?.[0]) {
            userData.lastTweetId = tweets.data.data[0].id;
        }

        // Check again after 30 seconds
        setTimeout(() => checkNewTweets(username), 30000);
    } catch (error) {
        console.error(`Error checking tweets for ${username}:`, error);
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
                const username = args[0].replace('@', '');
                const success = await startTracking(username, message.channel.id);
                if (success) {
                    message.reply(`Now tracking tweets from @${username} in this channel! Will detect Solana tokens and provide Jupiter trading links.`);
                } else {
                    message.reply(`Failed to track @${username}. Please check the username and try again.`);
                }
                break;

            case 'untrack':
                if (!args.length) {
                    message.reply('Please provide a Twitter username to untrack! Usage: !untrack <username>');
                    return;
                }
                const untrackUsername = args[0].replace('@', '');
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
                    message.reply(`Currently tracking: ${tracked.map(u => '@' + u).join(', ')}`);
                }
                break;

            case 'help':
                message.reply({
                    embeds: [{
                        title: 'Bot Commands',
                        description: 'Here are all available commands:',
                        fields: [
                            { name: '!track <username>', value: 'Start tracking a Twitter account (includes replies and Solana token detection)' },
                            { name: '!untrack <username>', value: 'Stop tracking a Twitter account' },
                            { name: '!list', value: 'List all tracked accounts' },
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
    client.user.setActivity('!help for commands', { type: 'PLAYING' });
});

client.login(process.env.DISCORD_TOKEN);