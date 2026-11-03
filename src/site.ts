import jsonData from './site.json'

export interface SiteLink {
  label: string
  url: string
}

export interface SiteInfo {
  name: string
  intro: string
  about: string[]
  links: SiteLink[]
}

// 站点信息的数据源是 src/site.json（会被本地面板编辑），这里只负责类型和导出
export const site: SiteInfo = jsonData
