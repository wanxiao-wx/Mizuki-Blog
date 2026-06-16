import type { ProfileConfig } from "../types/config";

// 个人资料配置
export const profileConfig: ProfileConfig = {
	avatar: "assets/images/avatar.png", // 相对于 /src 目录。如果以 '/' 开头，则相对于 /public 目录
	name: "潇拾壹",
	bio: "蜀黍啊，也曾渴望成为正义的伙伴啊",
	typewriter: {
		enable: true, // 启用个人简介打字机效果
		speed: 80, // 打字速度（毫秒）
	},
	links: [
		{
			name: "Bilibili",
			icon: "fa7-brands:bilibili",
			url: "https://space.bilibili.com/2620220?spm_id_from=333.1007.0.0",
		},
		{
			name: "GitHub",
			icon: "fa7-brands:github",
			url: "https://github.com/wanxiao-wx",
		},
		{
			name: "Discord",
			icon: "fa7-brands:discord",
			url: "https://discord.com/users/950949688947925022",
		},
	],
};
