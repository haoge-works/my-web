import jsonData from './projects.json'

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

export const projects: Project[] = (jsonData as RawProject[]).map(p => ({
  ...p,
  status:
    p.status === 'done'
      ? 'done'
      : p.status === 'maintaining'
        ? 'maintaining'
        : 'active',
}))
