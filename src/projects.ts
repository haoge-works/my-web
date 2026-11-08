import jsonData from './projects.json'
import orderJson from './showcase-order.json'

export type ProjectStatus = 'active' | 'done' | 'maintaining'

export interface Project {
  name: string
  summary: string
  /** 技术栈标签 */
  tags: string[]
  status: ProjectStatus
  /** GitHub 仓库链接（可选，没有则不展示） */
  repo?: string
  /** 在线预览链接（可选，没有则不展示） */
  demo?: string
  /** 项目案例页 slug（对应 src/showcases/<case>.md，可选） */
  case?: string
}

export const projectStatusLabels: Record<ProjectStatus, string> = {
  active: '进行中',
  done: '已完成',
  maintaining: '维护中',
}

// 项目数据的数据源是 src/projects.json，这里只负责类型和导出（与 site.ts 同思路）
// json 导入会把 status 宽化成 string，这里归一化成合法枚举（非法值兜底为 active）
type RawProject = Omit<Project, 'status'> & { status?: string }

const normalized: Project[] = (jsonData as RawProject[]).map(p => ({
  ...p,
  status:
    p.status === 'done'
      ? 'done'
      : p.status === 'maintaining'
        ? 'maintaining'
        : 'active',
}))

// 手动排序：与 showcase 案例共用 src/showcase-order.json（案例 slug 清单，
// 面板项目区 ▲▼ 维护）。案例 slug 在清单里的卡片按清单顺序排最前；
// 未登记的卡片保持 projects.json 本身顺序排在后面。
const caseOrderIndex = new Map<string, number>(orderJson.map((slug, i) => [slug, i]))

export const projects: Project[] = normalized
  .map((p, i) => ({
    p,
    key: p.case != null && caseOrderIndex.has(p.case) ? caseOrderIndex.get(p.case)! : Number.POSITIVE_INFINITY,
    i,
  }))
  .sort((x, y) => x.key - y.key || x.i - y.i)
  .map(x => x.p)
