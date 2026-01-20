import { renderRss2 } from '../../utils/util';

// 使用小红书的 API 而不是爬取网页
let getUserInfo = async (uid) => {
	const url = `https://edith.xiaohongshu.com/api/sns/web/v1/user/otherinfo?target_user_id=${uid}`;
	
	let res = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
			"Accept": "application/json, text/plain, */*",
			"Referer": `https://www.xiaohongshu.com/user/profile/${uid}`,
			"Origin": "https://www.xiaohongshu.com",
		}
	});
	
	if (!res.ok) {
		throw new Error(`获取用户信息失败: ${res.status}`);
	}
	
	const data = await res.json();
	if (data.code !== 0) {
		throw new Error(`API 返回错误: ${data.msg || data.code}`);
	}
	
	return data.data;
};

let getUserNotes = async (uid) => {
	const url = `https://edith.xiaohongshu.com/api/sns/web/v1/user_posted?num=30&user_id=${uid}&image_formats=jpg,webp,avif`;
	
	let res = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
			"Accept": "application/json, text/plain, */*",
			"Referer": `https://www.xiaohongshu.com/user/profile/${uid}`,
			"Origin": "https://www.xiaohongshu.com",
		}
	});
	
	if (!res.ok) {
		throw new Error(`获取用户笔记失败: ${res.status}`);
	}
	
	const data = await res.json();
	if (data.code !== 0) {
		throw new Error(`API 返回错误: ${data.msg || data.code}`);
	}
	
	return data.data;
};

let deal = async (ctx) => {
	const { uid } = ctx.req.param();
	const url = `https://www.xiaohongshu.com/user/profile/${uid}`;

	// 获取用户信息和笔记
	const [userInfo, notesData] = await Promise.all([
		getUserInfo(uid),
		getUserNotes(uid)
	]);
	
	const basicInfo = userInfo.basic_info || {};
	const nickname = basicInfo.nickname || basicInfo.nick_name || '未知用户';
	const description = basicInfo.desc || basicInfo.description || '';
	const avatar = basicInfo.imageb || basicInfo.images || basicInfo.image || '';
	
	const title = `${nickname} 的笔记 • 小红书`;
	
	// 处理笔记数据
	const notes = notesData.notes || [];
	
	const items = notes.map((note) => {
		const noteId = note.note_id || '';
		const noteTitle = note.display_title || note.title || '无标题';
		const noteType = note.type || 'normal';
		
		// 获取封面图
		let coverUrl = '';
		if (note.cover && note.cover.url) {
			coverUrl = note.cover.url;
		} else if (note.cover && note.cover.url_default) {
			coverUrl = note.cover.url_default;
		} else if (note.image_list && note.image_list.length > 0) {
			coverUrl = note.image_list[0].url || note.image_list[0].url_default || '';
		}
		
		// 获取互动数据
		const likedCount = note.interact_info?.liked_count || note.liked_count || '0';
		
		// 构建描述
		let desc = '';
		if (coverUrl) {
			desc += `<img src="${coverUrl}">`;
		}
		desc += `<br>${noteTitle}`;
		if (note.desc) {
			desc += `<br><br>${note.desc}`;
		}
		
		return {
			title: noteTitle,
			link: noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : url,
			guid: noteId || noteTitle,
			description: desc,
			author: nickname,
			pubDate: note.time ? new Date(note.time * 1000).toUTCString() : undefined,
			category: noteType,
		};
	}).filter(item => item.title); // 过滤掉无效项

	ctx.header('Content-Type', 'application/xml');
	return ctx.text(
		renderRss2({
			title,
			description: description || `${nickname} 在小红书的笔记`,
			image: avatar,
			link: url,
			items,
		})
	);
};

let setup = (route) => {
	route.get('/xiaohongshu/user/:uid', deal);
};

export default { setup };
