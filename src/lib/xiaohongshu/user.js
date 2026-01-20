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
	
	// 临时调试：查看找到的 script 数量
	console.log('Total scripts found:', scripts.length);
	console.log('Scripts with __INITIAL_STATE__:', scripts.filter(s => s.includes('__INITIAL_STATE__')).length);
	
	// 查找包含 __INITIAL_STATE__ 的 script
	let script = scripts.find((script) => script.includes('window.__INITIAL_STATE__'));
	
	if (!script) {
		// 尝试查找其他可能的变量名
		script = scripts.find((script) => script.includes('__INITIAL_STATE__'));
		if (script) {
			console.log('Found __INITIAL_STATE__ without window prefix');
		}
	}
	
	if (!script) {
		throw new Error(`无法找到页面数据，可能是小红书检测到了爬虫请求。找到 ${scripts.length} 个 script 标签，但没有包含初始状态数据。`);
	}
	
	// 提取 JSON 部分，支持多种格式
	let match = script.match(/(?:window\.)?__INITIAL_STATE__\s*=\s*({[\s\S]*?)(?:<\/script>|$)/);
	if (!match) {
		console.log('Script content preview:', script.substring(0, 200));
		throw new Error('无法解析页面数据格式');
	}
	
	console.log('Successfully extracted JSON, length:', match[1].length);
	
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

	const userData = await getUser(url);
	
	// 临时调试：查看数据结构（部署后可以删除这部分）
	console.log('userData keys:', userData ? Object.keys(userData) : 'null');
	console.log('userPageData:', userData?.userPageData ? Object.keys(userData.userPageData) : 'null');
	
	// 检查数据完整性
	if (!userData || !userData.userPageData) {
		throw new Error(`无法获取用户数据。返回的数据结构: ${JSON.stringify(userData ? Object.keys(userData) : null)}`);
	}
	
	const { userPageData, notes, collect } = userData;
	const { basicInfo, interactions, tags } = userPageData;
	
	if (!basicInfo || !basicInfo.nickname) {
		throw new Error('用户信息不完整，可能是该用户不存在或页面结构已变化');
	}

	const title = `${basicInfo.nickname} - ${category === 'notes' ? '笔记' : '收藏'} • 小红书 / RED`;
	const tagsStr = tags && tags.length > 0 ? tags.filter(t => t.name).map((t) => t.name).join(' ') : '';
	const interactStr = interactions && interactions.length > 0 ? interactions.map((i) => `${i.count} ${i.name}`).join(' ') : '';
	const description = `${basicInfo.desc || ''} ${tagsStr} ${interactStr}`.trim();
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
