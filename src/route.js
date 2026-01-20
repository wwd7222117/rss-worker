import { Hono } from 'hono';
import bilibili_user_dynamic from './lib/bilibili/user/dynamic';
import bilibili_user_video from './lib/bilibili/user/video';
import telegram_channel from './lib/telegram/channel';
import weibo_user from './lib/weibo/user';
import xiaohongshu_user from './lib/xiaohongshu/user';

const route = new Hono();

let plugins = [bilibili_user_dynamic, bilibili_user_video, telegram_channel, weibo_user, xiaohongshu_user];

for (let plugin of plugins) {
	plugin.setup(route);
}

// 临时调试路由
route.get('/debug/xiaohongshu/:uid', async (ctx) => {
	const { uid } = ctx.req.param();
	const url = `https://www.xiaohongshu.com/user/profile/${uid}`;
	
	try {
		let res = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
				"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
				"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			}
		});
		
		const text = await res.text();
		const hasInitialState = text.includes('__INITIAL_STATE__');
		const scriptMatches = text.match(/<script[^>]*>/g);
		
		return ctx.json({
			status: res.status,
			hasInitialState,
			textLength: text.length,
			scriptTagsCount: scriptMatches ? scriptMatches.length : 0,
			preview: text.substring(0, 500),
		});
	} catch (e) {
		return ctx.json({ error: e.message, stack: e.stack });
	}
});

export default route;
