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

// 临时调试路由 - 测试小红书 API
route.get('/debug/xiaohongshu/:uid', async (ctx) => {
	const { uid } = ctx.req.param();
	
	try {
		// 测试用户信息 API
		const userInfoUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo?target_user_id=${uid}`;
		const userInfoRes = await fetch(userInfoUrl, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
				"Accept": "application/json, text/plain, */*",
				"Referer": `https://www.xiaohongshu.com/user/profile/${uid}`,
			}
		});
		const userInfo = await userInfoRes.json();
		
		// 测试笔记 API
		const notesUrl = `https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?num=30&user_id=${uid}&image_formats=jpg,webp,avif`;
		const notesRes = await fetch(notesUrl, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
				"Accept": "application/json, text/plain, */*",
				"Referer": `https://www.xiaohongshu.com/user/profile/${uid}`,
			}
		});
		const notes = await notesRes.json();
		
		return ctx.json({
			userInfo: {
				status: userInfoRes.status,
				data: userInfo,
			},
			notes: {
				status: notesRes.status,
				data: notes,
				notesCount: notes.data?.notes?.length || 0,
			}
		});
	} catch (e) {
		return ctx.json({ error: e.message, stack: e.stack });
	}
});

export default route;
