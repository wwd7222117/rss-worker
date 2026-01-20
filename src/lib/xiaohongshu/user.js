import { renderRss2 } from '../../utils/util';

let getUser = async (url) => {
	let res = await fetch(url, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
			"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
			"Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
			"Accept-Encoding": "gzip, deflate, br",
			"Referer": "https://www.xiaohongshu.com/",
			"Sec-Fetch-Dest": "document",
			"Sec-Fetch-Mode": "navigate",
			"Sec-Fetch-Site": "same-origin",
		}
	});
	let scripts = [];
	let rewriter = new HTMLRewriter()
		.on('script', {
			element(element) {
				scripts.push('');
			},
			text(text) {
				scripts[scripts.length - 1] += text.text;
			},
		})
		.transform(res);
	await rewriter.text();
	
	// 查找包含 __INITIAL_STATE__ 的 script
	let script = scripts.find((script) => script.includes('window.__INITIAL_STATE__'));
	
	if (!script) {
		throw new Error('无法找到页面数据，可能是小红书检测到了爬虫请求。请尝试稍后再试或联系开发者。');
	}
	
	// 提取 JSON 部分，支持多种格式
	let match = script.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?)(?:<\/script>|$)/);
	if (!match) {
		throw new Error('无法解析页面数据格式');
	}
	
	let jsonStr = match[1].trim();
	// 去掉可能的分号结尾
	if (jsonStr.endsWith(';')) {
		jsonStr = jsonStr.slice(0, -1);
	}
	
	// replace undefined to null
	jsonStr = jsonStr.replace(/undefined/g, 'null');
	
	let state = JSON.parse(jsonStr);
	return state.user;
};

let deal = async (ctx) => {
	// const uid = ctx.params.user_id;
	// const category = ctx.params.category;
	const { uid } = ctx.req.param();
	const category = 'notes';
	const url = `https://www.xiaohongshu.com/user/profile/${uid}`;

	const {
		userPageData: { basicInfo, interactions, tags },
		notes,
		collect,
	} = await getUser(url);

	const title = `${basicInfo.nickname} - ${category === 'notes' ? '笔记' : '收藏'} • 小红书 / RED`;
	const tagsStr = tags.filter(t => t.name).map((t) => t.name).join(' ');
	const interactStr = interactions.map((i) => `${i.count} ${i.name}`).join(' ');
	const description = `${basicInfo.desc} ${tagsStr} ${interactStr}`.trim();
	const image = basicInfo.imageb || basicInfo.images;

	const renderNote = (notes) =>
		notes.flatMap((n) =>
			n.map(({ noteCard }) => {
				// 使用封面图片 URL 列表的最后一个（通常是最高质量的）
				const coverUrl = noteCard.cover.infoList && noteCard.cover.infoList.length > 0
					? noteCard.cover.infoList[noteCard.cover.infoList.length - 1].url
					: noteCard.cover.urlDefault || noteCard.cover.url;
				
				// 如果 noteId 为空，使用用户主页作为链接
				const noteLink = noteCard.noteId 
					? `https://www.xiaohongshu.com/explore/${noteCard.noteId}`
					: url;
				
				return {
					title: noteCard.displayTitle,
					link: noteLink,
					guid: noteCard.noteId || noteCard.displayTitle,
					description: `<img src="${coverUrl}"><br>${noteCard.displayTitle}`,
					author: noteCard.user.nickname || noteCard.user.nickName,
					upvotes: noteCard.interactInfo.likedCount,
				};
			})
		);
	const renderCollect = (collect) => {
		if (!collect) {
			throw Error('该用户已设置收藏内容不可见');
		}
		if (collect.code !== 0) {
			throw Error(JSON.stringify(collect));
		}
		if (!collect.data.notes.length) {
			throw ctx.throw(403, '该用户已设置收藏内容不可见');
		}
		return collect.data.notes.map((item) => ({
			title: item.display_title,
			link: `${url}/${item.note_id}`,
			description: `<img src ="${item.cover.info_list.pop().url}"><br>${item.display_title}`,
			author: item.user.nickname,
			upvotes: item.interact_info.likedCount,
		}));
	};

    ctx.header('Content-Type', 'application/xml');
	return ctx.text(
		renderRss2({
			title,
			description,
			image,
			link: url,
			items: category === 'notes' ? renderNote(notes) : renderCollect(collect),
		})
	);
};

let setup = (route) => {
	route.get('/xiaohongshu/user/:uid', deal);
};

export default { setup };
