// 友情链接数据配置
// 用于管理友情链接页面的数据

export interface FriendItem {
	id: number;
	title: string;
	imgurl: string;
	desc: string;
	siteurl: string;
	tags: string[];
}

// 友情链接数据
export const friendsData: FriendItem[] = [
	{
		id: 1,
		title: "Mizuki Docs",
		imgurl:
			"https://q.qlogo.cn/headimg_dl?dst_uin=3231515355&spec=640&img_type=jpg",
		desc: "Mizuki 使用手册",
		siteurl: "https://docs.mizuki.mysqil.com",
		tags: ["文档"],
	},
	{
		id: 2,
		title: "U2",
		imgurl: "/images/friends/sakura-icon.webp",
		desc: "中文圈顶级动漫原盘 PT 站",
		siteurl: "https://u2.dmhy.org/index.php",
		tags: ["PT 站", "动漫"],
	},
	{
		id: 3,
		title: "动漫花园",
		imgurl: "/images/friends/anime-garden.webp",
		desc: "公开的BT资源分享平台",
		siteurl: "https://dmhy.org/",
		tags: ["动漫"],
	},
	{
		id: 4,
		title: "AnimeBytes",
		imgurl: "/images/friends/pink-a-icon.webp",
		desc: "二次元 PT 站的终极天花板",
		siteurl: "https://animebytes.tv/",
		tags: ["PT 站", "动漫"],
	},
];

// 获取所有友情链接数据
export function getFriendsList(): FriendItem[] {
	return friendsData;
}

// 获取随机排序的友情链接数据
export function getShuffledFriendsList(): FriendItem[] {
	const shuffled = [...friendsData];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	return shuffled;
}
