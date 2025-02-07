import tweepy
import discord
from discord.ext import commands
import json
import asyncio
from datetime import datetime

# Load config from JSON file
def load_config():
    with open('config.json', 'r') as f:
        return json.load(f)

# Twitter API authentication
def setup_twitter_api(config):
    auth = tweepy.OAuthHandler(config['twitter']['consumer_key'], 
                             config['twitter']['consumer_secret'])
    auth.set_access_token(config['twitter']['access_token'], 
                         config['twitter']['access_token_secret'])
    return tweepy.API(auth)

class TwitterStream(tweepy.StreamingClient):
    def __init__(self, bearer_token, discord_bot, channel_id):
        super().__init__(bearer_token)
        self.discord_bot = discord_bot
        self.channel_id = channel_id

    async def send_to_discord(self, tweet_text, author_name, tweet_url):
        channel = self.discord_bot.get_channel(self.channel_id)
        embed = discord.Embed(
            title=f"New Tweet from {author_name}",
            description=tweet_text,
            url=tweet_url,
            color=discord.Color.blue(),
            timestamp=datetime.utcnow()
        )
        await channel.send(embed=embed)

    def on_tweet(self, tweet):
        tweet_url = f"https://twitter.com/user/status/{tweet.id}"
        asyncio.run_coroutine_threadsafe(
            self.send_to_discord(
                tweet.text,
                tweet.author.name,
                tweet_url
            ),
            self.discord_bot.loop
        )

class DiscordBot(commands.Bot):
    def __init__(self):
        intents = discord.Intents.default()
        intents.message_content = True
        super().__init__(command_prefix='!', intents=intents)
        self.twitter_stream = None
        
    async def setup_hook(self):
        await self.add_cog(TwitterCommands(self))

class TwitterCommands(commands.Cog):
    def __init__(self, bot):
        self.bot = bot
        self.config = load_config()
        self.twitter_api = setup_twitter_api(self.config)
        self.followed_users = set()

    @commands.command(name='follow')
    async def follow_user(self, ctx, username: str):
        try:
            user = self.twitter_api.get_user(screen_name=username)
            if not self.bot.twitter_stream:
                self.bot.twitter_stream = TwitterStream(
                    self.config['twitter']['bearer_token'],
                    self.bot,
                    ctx.channel.id
                )
            
            self.bot.twitter_stream.add_rules(
                tweepy.StreamRule(f"from:{username}")
            )
            self.followed_users.add(username)
            await ctx.send(f"Now following tweets from @{username}")
        except Exception as e:
            await ctx.send(f"Error following user: {str(e)}")

    @commands.command(name='unfollow')
    async def unfollow_user(self, ctx, username: str):
        try:
            rules = self.bot.twitter_stream.get_rules()
            for rule in rules.data:
                if f"from:{username}" in rule.value:
                    self.bot.twitter_stream.delete_rules(rule.id)
            
            self.followed_users.remove(username)
            await ctx.send(f"Stopped following @{username}")
        except Exception as e:
            await ctx.send(f"Error unfollowing user: {str(e)}")

    @commands.command(name='list')
    async def list_followed(self, ctx):
        if not self.followed_users:
            await ctx.send("Not following any users.")
            return
        
        users_list = "\n".join(f"@{user}" for user in self.followed_users)
        await ctx.send(f"Currently following:\n{users_list}")

def main():
    config = load_config()
    bot = DiscordBot()
    bot.run(config['discord']['token'])

if __name__ == "__main__":
    main() 