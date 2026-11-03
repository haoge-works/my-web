---
title: 我的AGENTS
date: 2026-11-03
tags: [技术, Vue]
summary: opencode药品零售管理系统ai智能体规范，约束。
---
# AGENTS.md

## Quick start

- **启动**: 双击 `start.bat`（激活 `venv/` → `python app.py`）
- **虚拟环境**: `venv\Scripts\activate`，依赖锁在 `requirements.txt`
- **默认账号**: admin / admin1234
- **数据库**: MySQL 8.4.11，库 `drug_management`，用户 `drug_admin`，密码见 `config.py` 环境变量
- **版本**: `VERSION = '2.0.0'` (config.py:7)
- **`.env`**: 包含 `MYSQL_PASSWORD`、`MI_ENABLED`、`MI_TEST_MODE` 等环境变量

## Architecture

- **纯零售系统**（无批发模块）—— 入库单 `WarehouseEntry` 确认后写入 `RetailInventory`（唯一库存表），POS 收银台 `RetailOrder` 扣减库存
- **Flask** 单体应用，`app.py` 是入口，注册 **16 个蓝图**：
  - `/basic` → 基础资料（供应商首营/商品首营/商品资料/供应商/证照/部门/调价）
  - `/purchase` → 采购入库（订货单/入库单/购进退货单/验收/拒收）
  - `/retail` → 零售管理（库存查询/POS 收银台/销售记录/退货/会员/日结/药学服务/盘点）
  - `/finance` → 财务管理（供应商结算）
  - `/quality` → 质量管理（养护/温湿度/召回/不良反应/停售/投诉/陈列检查/内审/文件/CAPA/校准/冷链/重点养护/单据作废/ dashboard）
  - `/prescription` → 处方管理（录入/审核/关联销售）
  - `/special` → 特殊药品台账（麻醉/精神/毒性/放射性/易制毒）
  - `/training` → 培训管理（计划/记录/统计）
  - `/trace` → 药品追溯码采集/上传/平台对接
  - `/reports` → 报表中心（购进/验收/养护/销售/温湿度/召回/缺陷）
  - `/drug-ai` → AI 辅助配置（集成大模型 API）
  - `/insurance` → 医保管理（结算/目录/处方）
  - `/variable` → 变量配置（字典/参数）
  - `/report-templates` → 打印模板设计器（流式布局/画布/混合模式）
  - `/personnel` → 人员管理（用户/健康档案/资质证书/操作日志）
  - `/auth` → 权限管理（角色/菜单/部门权限）
- 模板使用 Jinja2 + Bootstrap 5 + Font Awesome，`base.html` 包含侧边栏和全局布局
- SQLAlchemy ORM，模型定义在 `models/` 目录（26 个文件）
- APScheduler 定时任务：每天凌晨 2:00 自动停售过期药品（`app.py:752`）

## Key conventions

- **入库流程**: `WarehouseEntry` 是唯一入库入口（UI 中叫"入库单"），确认后写入 `RetailInventory`（`routes/purchase.py:entry_confirm`）
- **退货扣减**: 购进退货从 `RetailInventory` 扣减（`purchase_return_confirm`）；零售退货恢复库存（`return_confirm`）
- **特殊药品双人复核**: 含特殊药品（麻醉/精神/毒性/放射性/易制毒）的入库单需第二人登录复核（`_has_controlled` 检测）
- **单号生成**: `utils/helpers.py:generate_order_no(prefix)`，前缀：PO(订货)/IN(入库)/PR(购进退)/RS(零售)/RR(零售退)/MH(养护)/TR(培训)/SP(特殊药品)/SUP/M 等
- **金额计算**: `calc_amount(qty, price)` 返回两位小数 float
- **登录装饰器**: `login_required` 在 `app.py` 中全局定义（`db.session.get(User, session['user_id'])`）；`permission_required(code)` 在每个蓝图内独立定义
- **操作日志**: `log_operation(user_id, username, action, module, detail)` 写入 `operation_logs` 表
- **分页**: 通用分页参数 `page` + `per_page=15`，传递 `pagination` 对象到模板；报表使用 `PER_PAGE=30`
- **懒加载**: 列表页（含报表）用 `has_filter` 守卫，无筛选条件时直接返回空列表，不执行 SQL（`routes/reports.py`、`routes/prescription.py`、`routes/special_drug.py`、`routes/training.py` 等）
- **拼音首字母**: `utils/pinyin.py:pinyin_short()` 用于 `api_search` 拼音检索、首营/商品拼音自动回填
- **医保接口**: `config.py:MEDICAL_INSURANCE` 配置，国密 SM2/SM4 加密（`utils/sm_crypto.py`），按省配置（当前 `yn`），`MI_TEST_MODE=true` 为测试模式
- **追溯码**: `entry_form.html` 扫码录入＋隐藏 `trace_codes` 字段 → `entry_add()` 创建 `TraceabilityCode` 记录；`entry_view.html` 实时 `api_batch_entry` 逐条保存；`api_upload_to_platform` 批量上传国家追溯平台
- **`outerjoin` + `filter_by` 禁用**: SQLAlchemy 2.x 兼容问题，必须用显式 `filter(Model.column == value)`
- **`**request.args` 冲突**: 用全局 `page_args` context processor 排除 `page` 参数

## Commands

```bash
# 安装依赖
venv\Scripts\activate && pip install -r requirements.txt

# 启动 dev server
python app.py    # 默认 :5000, debug=True, use_reloader=False

# 初始化数据库（首次运行自动调用 init_db()）

# 克隆项目（新电脑首次使用）
git clone git@github.com:haoge-works/wholesale_retail-system.git
cd wholesale_retail-system\retail
```

### 数据库初始化与迁移

表结构有两条维护路径，务必按此理解：

1. **`init_db()` → `db.create_all()`**：应用启动时自动建表（新建库全量建表；已有库只补**缺失的表**，**不补列**）。
2. **Alembic 迁移**：新增/修改**列**走 `flask db migrate` + `flask db upgrade`。

**关键规则**

- 新建空库首次启动时，`init_db()` 在 `create_all()` 后**自动 `flask db stamp head`**，
  避免随后执行 `flask db upgrade` 时重跑初始迁移（`CREATE TABLE` 已存在）而失败。
- 迁移必须**幂等**：`create_all()` 可能已提前建好表/列，`upgrade()` 内需用 `inspect` 判断后再操作
  （参考 `migrations/versions/b4c5d6e7f8a9_*.py`、`d4e5f6a7b8c9_*.py`、`e5f6a7b8c9d0_*.py`）。
- **禁止复用已有 revision ID**（会导致 alembic `CycleDetected` 而全部命令失效）。

```bash
# 查看当前版本 / 所有 head
flask db current
flask db heads

# 新增迁移（改完 models 后）
flask db migrate -m "描述"
flask db upgrade

# 库结构已最新但版本号落后时（如手工补过列）
flask db stamp head
```

## Project structure

```
E:\药品经营管理系统\retail\
├── app.py                    # 入口、认证、蓝图注册(16个)、init_db()、错误处理器、调度器
├── config.py                 # MySQL/医保/版本配置
├── extensions.py             # CSRFProtect 单例
├── models/                   # SQLAlchemy 模型（26个文件）
│   ├── __init__.py           # db 对象 + 所有模型导入 + ReportTemplate 工厂
│   ├── base.py               # Department/User/Role/Permission/Menu/OperationLog/Dictionary
│   ├── supplier.py           # Supplier/SupplierFirstTrial/SupplierDocument/SupplierModifyApplication
│   ├── product.py            # ProductFirstTrial/ProductInfo/ProductModifyApplication
│   ├── purchase.py           # PurchaseOrder/WarehouseEntry/PurchaseReturn/ReceiveInspection/RejectionRecord
│   ├── retail.py             # RetailInventory/RetailOrder/Member/Stocktake/...
│   ├── finance.py            # SupplierSettlement/SupplierSettlementItem
│   ├── quality.py            # DrugMaintenance/TempHumidityLog/DrugRecall/AdverseReaction/StopSaleNotice
│   ├── prescription.py       # Prescription
│   ├── defective.py          # DefectiveProduct
│   ├── special_drug.py       # SpecialDrugRecord
│   ├── training.py           # TrainingPlan/TrainingRecord
│   ├── price_change.py       # PriceChange
│   ├── traceability.py       # TraceabilityCode
│   ├── complaint.py          # Complaint
│   ├── employee_health.py    # EmployeeHealth/EmployeeCertificate
│   ├── shelf_check.py        # ShelfCheck
│   ├── audit.py              # InternalAudit
│   ├── quality_doc.py        # QualityDocument
│   ├── capa.py               # CAPA
│   ├── calibration.py        # CalibrationRecord
│   ├── pharmacy_service.py   # PharmaceuticalService
│   ├── cold_chain.py         # ColdChainLog
│   ├── key_maintenance.py    # KeyMaintenanceItem
│   └── insurance.py          # InsuranceSettlement/InsuranceCatalog/InsurancePrescription
├── routes/                   # 蓝图路由（16个模块）
│   ├── basic_info.py         # /basic — 49个路由（首营/供应商品/商品/证照/调价/部门）
│   ├── purchase.py           # /purchase — 采购入库/退货/验收/拒收 API
│   ├── retail.py             # /retail — 零售库存/POS/退货/会员/日结/盘点/药学服务
│   ├── finance.py            # /finance — 供应商结算
│   ├── quality.py            # /quality — 70个路由（养护/温湿度/召回/不良反应/投诉/内审等）
│   ├── prescription.py       # /prescription — 处方管理
│   ├── special_drug.py       # /special — 特殊药品台账
│   ├── training.py           # /training — 培训管理
│   ├── traceability.py       # /trace — 追溯码
│   ├── reports.py            # /reports — 7个报表+通用查询导出
│   ├── drug_ai.py            # /drug-ai — AI 辅助配置
│   ├── medical_insurance.py  # /insurance — 医保管理
│   ├── variable.py           # /variable — 变量配置
│   ├── personnel.py          # /personnel — 人员/健康/证书/日志
│   ├── auth.py               # /auth — 角色/权限/部门权限
│   └── print_designer/       # 打印模块设计器（blueprint/host/DataProvider/BlockRegistry/static/templates）
├── templates/                # Jinja2 模板（按模块分目录）
│   ├── base.html             # 全局布局 + 侧边栏（16个菜单类别）
│   ├── errors/               # 403/404/500 错误页
│   └── {模块名}/             # 各模块模板文件
├── utils/
│   ├── helpers.py            # 工具函数（单号/金额/日志/状态文字）
│   ├── pinyin.py             # 拼音首字母转换
│   ├── drug_ai.py            # AI 配置管理 + 用药检查器
│   ├── trace_api.py          # 国家追溯平台 API
│   ├── sm_crypto.py          # 国密 SM2/SM4 加解密
│   ├── report_fields.py      # 报表字段定义
│   └── medical_insurance/    # 医保接口（按省实现）
├── lib/print_core/           # 打印渲染核心（renderer/model/types）
├── scripts/                  # 迁移/验证脚本（仅历史参考）
├── test_business_flows.py    # 核心业务流集成测试（6个flow, 40断言）
├── backup.py / start.bat     # 数据库备份 / 启动脚本
├── migrations/               # Flask-Migrate 版本
└── logs/                     # 日志文件（TimedRotatingFileHandler, 7天轮转）
```

## Git workflow

- **直接推送 `master`**，无需创建分支
- Push 前运行 `git fetch origin && git rebase origin/master`
- **严禁** `push --force` 到共享分支
- 提交信息格式: `<type>: <描述>`（type: fix/feat/refactor/perf/chore/docs）

```bash
# 日常开发流
git add -A && git commit -m "fix: 描述"
git fetch origin && git rebase origin/master
git push origin master
```

- **冲突解决**: 始终用 `rebase` 不用 `merge`；冲突时手动解决 → `git rebase --continue`
- **数据库迁移**: 任何 models 改动需运行 `flask db migrate -m "描述"` → 提交 migrations 文件

### 多机协作要点

1. **新电脑首次使用**：`git clone` 后需手动创建 `.env`，配置本地 MySQL 密码等环境变量（`.env` 在 `.gitignore` 中，不随仓库同步）
2. **工作前必拉取**：`git pull --ff-only` 确保基于最新代码开发
3. **推送前必拉取**：`git pull --ff-only` 检出远端最新提交，提前发现冲突
4. **冲突处理**：用 `git pull --rebase` 而非 `git pull`（避免多余 merge commit），手动解决冲突后 `git add -A && git rebase --continue`
5. **备份恢复**：其他电脑的数据库通过 `backup.py` 备份的 SQL 文件恢复，不要直接复制 `drug_management` 库文件

## Anchored Summary

### 核心业务流
- Flow 1: 采购入库 → 库存增加（100盒）
- Flow 2: POS零售开单 → 库存扣减（-2盒）
- Flow 3: 零售退货 → 库存恢复（+1盒）
- Flow 4: 购进退货 → 库存扣减（-5盒）
- Flow 5a: 已售库存的入库单禁止作废（业务护城河）
- Flow 5b: 购进退货单作废 → 库存恢复

### 已实现模块
- **GSP 合规全流程**: 首营供应商(三审)/首营商品(三审)/首营变更申请→审批/供应商证照管理+到期预警
- **采购仓储**: 订货单(编辑/删除/确认/作废)→入库单(逐条AJAX保存/追溯码采集/双人复核)→购进退货
- **零售端**: POS收银(支持医保/会员/处方关联/库存FOR UPDATE锁防超卖)→销售记录→退货→日结
- **质量管理**: 养护(含自动生成计划/重点养护设定)→温湿度(传感器/自动采集/报警)→召回→不良反应→停售(自动2AM批处理)→投诉→陈列检查→内审→文件→CAPA→校准→冷链
- **特殊药品**: 含麻/精/毒/放/易制毒全程台账追踪(双人复核/身份证登记)
- **处方管理**: 登记/审核/关联销售单/图片上传
- **培训管理**: 计划→实施→记录→统计报表
- **追溯码**: 采集→上传国家追溯平台(国密SM2/SM4签名)
- **报表中心**: 购进/验收/养护/销售/温湿度/召回/缺陷(懒加载+打印模板)
- **打印设计器**: 流式布局/自由画布/混合模式/Canvas编辑/Element Palette/撤销管理/标尺/对齐线
- **医保对接**: 结算/撤销/目录/处方(国密加密, 按省配置)
- **AI辅助**: 大模型API集成配置/用药检查
- **权限体系**: 角色→权限→菜单→部门权限→30+细粒度权限码
- **基础架构**: 登录防爆破/全局错误处理器+日志落盘/APScheduler定时任务/连接池优化

## Critical Context

- **Ctrl+F5** + **re-login** required after every restart（SECRET_KEY 自动生成）
- `use_reloader=False` — 修改代码需手动重启；Flask dev server 为主，Waitress (`threads=8`) 为 fallback
- `**request.args` in `url_for` → 必须用 `**page_args` 替代（`page` 参数冲突）
- Select2 AJAX 元素不能有 `select2-search` class（避免全局静态 init 覆盖 AJAX 配置）
- ~~`data-turbo="false"` 在表单上阻止 Turbo Drive 拦截 POST→302→GET 链路上的 session 丢失~~（Turbo 已移除）
- FULLTEXT ngram 索引: `MATCH(col) AGAINST(:q IN BOOLEAN MODE)`，≥2 字符用 MATCH，单字符 fallback LIKE
- CSRF: `csrf` 在 `extensions.py`，JSON API 路由标记 `@csrf.exempt`
- POS 收银 `retail.py:204` 和入库确认 `purchase.py:508` 使用 `with_for_update()` 防止超卖
- 所有 CDN 使用 `bootcdn.net`（`jsdelivr`/`cdnjs` 被浏览器 Tracking Prevention 拦截）
- **otc_type 传递链**: API `/retail/api/products` 返回 `otc_type` → `sale.html` 搜索结果 `data('id')` 必须存 `otc_type` → `addToCart()` 传入 → `productCache` 更新 → `hasRxDrug()` 检查 `p.otc_type === 'rx'`。缺任何一环则处方药检测失效、「提交审核」流程永不触发（`routes/retail.py:1090` + `sale.html:876/885/915`）
- `PER_PAGE`: 报表 30，库存 20，其余 15
- `get_dict_data()` 在 `routes/variable.py`（被 `basic_info.py`、`quality.py` 导入）
- 报表 `_query_report_data()` 已整合 `REPORT_FILTER_KEYS` 字典，用于懒加载+导出统一
- 打印模块 `lib/print_core/` (核心) + `routes/print_designer/` (Flask集成)，`ReportTemplate` 由 `models/__init__.py` 工厂创建
- **字典 code 修复**: 独立数据库的机器从硬编码切到变量配置后，`dictionaries` 表部分 dict_type 的 `code` 字段为空。跑 `fix_dictionary_codes.py` 自动补充（幂等，可重复执行）。详见 `fix_dictionary_codes.py`
- **SPA token 丢失修复**: 所有搜索建议（pinyin/autocomplete）的 Enter 键和点击事件已统一移除 `$().submit()`，改为仅填值。用户手动点击「查询」按钮触发 SPA GET 请求（带 `?st=` token）。涉及 36 个模板约 55 处 handler（basic_info/purchase/quality/retail/finance/reports 全部模块）。核心问题：`$('#searchForm').submit()`（jQuery trigger）不触发 `document` 上的原生 `addEventListener`，SPA handler 不执行，导致 token 丢失跳转 login。
- **空查询退出登录修复**: 列表页空条件点「查询」**禁用** `window.location.href = url_for(..., st=session.get('session_token',''))` + `return false`（`return false` 阻止事件冒泡绕过 SPA 提交拦截 `app.js:229`，且 st 是渲染时烘焙的旧值，空/过期 → `_ensure_authenticated` `not token` → session.clear() → 302 login）。统一范式：表单内 `<input type="hidden" name="show_all" id="showAllInput" value="0">` + `$('#searchForm').on('submit', function(){ if(!hasValue){ $('#showAllInput').val('1'); } })`（不 return false），由 SPA GET 分支（`app.js:360-374`）用 `window.name` 实时 token 拼 `?st=`。已覆盖 basic_info(4)+purchase order/entry+auth role。页面跳转一律用运行时 `getSt()`（`base.html:824` 全局，取 `window.name`）替代模板烘焙 `st=session.get('session_token')`，如 `onclick="location.href='{{ url_for(...) }}&st='+encodeURIComponent(getSt())"`。
- **next 无缝回跳统一**: 所有「列表筛选 → 编辑/操作 → 保存 → 返回列表」流程统一用 `next` 参数精确回跳（含页码）。三触点：①列表操作链接加 `next=request.full_path`；②表单页 `</form>` 前用宏 `{% from 'macros.html' import next_field %}{{ next_field() }}`；③路由保存/动作后 `redirect(safe_next(request.form.get('next') or request.args.get('next'), request.referrer or url_for(...)))`。`safe_next()` 在 `utils/helpers.py`（只允许站内相对路径，防开放重定向）。已覆盖 30+ 模板 / 9 个路由文件。`next` 值含 `?st=` 时 `app.py:92-99` 自动跳过补 token，无 st 时自动补全。参考范例 `routes/quality.py:141` + `templates/quality/maintenance.html:107`。
- **供应商停用业务规则**: `supplier_edit` POST（`routes/basic_info.py:512` 起）已持久化 `status`（active/inactive），锁定/审核中状态在 `supplier_form.html` 渲染只读（防保存静默解锁）。停用按供应商类型阻断：**distribution** 停用 → `order_add`/`order_edit`（`routes/purchase.py`）拒绝创建/修改订货单；**manufacturer** 停用 → 药品信息「生产企业」选择（`variable.api_manufacturers`，`Supplier.status != 'inactive'`）不出现 + `product_first_trial_add/edit`、`product_info_edit` 服务端拦截（改选停用厂家名才拦，保留原厂家不受影响，helper `_inactive_manufacturer_supplier`）；**both** 停用 → 两者都禁。采购下拉（`get_suppliers()`/`api_suppliers`/`report_manufacturer`）本就过滤 active。既有记录查询、入库单（关联既有订货单）、购进退货不受影响。`api_manufacturers` 仅排除停用（locked 仍可选）。验证脚本 `C:\Users\Administrator\AppData\Local\Temp\opencode\verify_disable.py`（测试库 23 断言）。
- **供应商审批与采购类型规则**: 生产企业（manufacturer）仅供药品信息「生产企业」字段调用、**无需首营审批**（`supplier_first_trial_add/edit` 直接建档 `source='direct'`+`audit_status='approved'`；approve 路由对 manufacturer 拒绝审批「无需审批」）。采购订单**硬拦截** manufacturer：`order_add`/`order_edit` 对 `supplier.supplier_type == 'manufacturer'` 无条件拒绝（与停用无关，flash「为生产企业，不能作为采购供货单位」）；采购只校验**类型**（须 distribution/both），**不校验 `audit_status`**（经营/生产+供货档案存在即代表已审批）。`supplier_first_trial_approve` 终审通过且 `trial.supplier_id` 存在时补 `s.audit_status='approved'`。存量异常数据（8 个 distribution+audit_status=pending、3 个 direct+both）用 `backfill_supplier_first_trials.py` 补建首营申请（幂等，关联 supplier_id，standalone 运行；**勿在 app_context 内嵌套调用**，嵌套 context 下提交不可见）。验证脚本 `C:\Users\Administrator\AppData\Local\Temp\opencode\verify_manufacturer_block.py`（测试库 21 断言）。
- **Jinja 宏限制**: Jinja2 3.1.x **不支持** macro 签名 `**kwargs`/`*args`（`parse_assign_target(name_only=True)` 只接受 name）。`macros.html` 的 `render_pagination(pagination, endpoint)` 用全局 `page_args` context processor（`app.py:173`）携带筛选参数，调用处必须 `{% from 'macros.html' import render_pagination with context %}`（`{% from %}` 默认不带 context，context_processor 变量到不了宏）。`next_field()` 用 `request`（Flask 全局）无需 `with context`。
