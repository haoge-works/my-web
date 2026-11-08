---
title: "药品零售经营管理系统"
date: "2026-11-05"
tags: ["Python", "Flask", "MySQL", "GSP", "LLM"]
summary: "符合 GSP 规范的药店全流程管理系统（v2.0）：49 张业务表覆盖采购入库、零售收银与质量管理，双人复核、20 位追溯码、国密医保对接，创新性融入 AI 用药辅助（云端 API + 本地 llama.cpp 双 Provider）。"
repo: "https://github.com/haoge-works/wholesale_retail-system"
---

这个项目是给药品零售企业做的一套全流程经营管理系统：从采购订货、入库验收，到 POS 收银、库存养护，再到质量管理与财务结算，一条线全覆盖。药品零售是个强监管行业，系统的第一目标是**把《药品经营质量管理规范》（GSP）的要求变成可执行的数据模型和业务拦截**，其次才是收银和库存这类通用 ERP 能力。v2.0.0，AGPL-3.0 + 商业双授权开源。

## 项目概览

| 维度 | 情况 |
| --- | --- |
| 技术栈 | Python 3.11 + Flask 3.0 + SQLAlchemy 2.0 / MySQL 8.4 + Jinja2 + Bootstrap 5 |
| 数据层 | 25 个模型文件、49 张业务表 |
| 服务端 | 路由蓝图 14 个、205+ 端点；Waitress 生产部署 |
| 前端 | 163+ Jinja2 模板，按业务模块分目录 |
| 业务模块 | 基础资料、采购入库、零售管理（POS）、质量管理、财务、人员与权限、信息管理 |
| 许可 | AGPL-3.0 开源 + 商业授权双授权 |

## 合规：GSP 规范怎么落在数据模型上

GSP 对药店的要求「药品购进、存储，销售，处方管理，监管码追溯体系，人员健康，继续教育等」。系统对 2016 修订版第二章到第十一章做了逐章建模，并按同一标准做过一轮内部合规审计，综合符合度约 92%，无严重不符项（4 项中低风险发现已全部修复）。几个有代表性的落地：

- **首营审批**：供应商和品种首次合作前必须走 `SupplierFirstTrial` / `ProductFirstTrial` 三级审批（部门审核 → 质量审核 → 终审），证照（营业执照/经营许可证/GSP/GMP）单独建档并带到期提醒
- **双人复核**：入库验收 `inspector_id` + `inspector2_id` 双人机制；含麻/精/易制毒类特殊药品出入库强制双人操作，POS 端同步拦截限售（限额 2 包装）
- **储存与养护**：温湿度「传感器 → 日志 → 报警」三件套；库存按色标管理（合格绿/待验黄/不合格红/退货）；过期库存由定时任务每日自动生成停售通知单
- **追溯**：`TraceabilityCode` 20 位追溯码贯穿采购入库 → 销售 → 退货 → 作废全状态流转
- **质量体系**：`QualityDocument` 覆盖起草→审核→批准→生效→废止文件生命周期；`CAPA`、内审、召回、投诉、设备校准、陈列检查全部有独立模型

合规不是写个「已实现」的清单就完事——这些模型会真实参与业务拦截，比如没有完成首营的供应商无法生成采购单，过期库存不生成停售单 POS 就卖不出去。

## 技术特点

- **权限体系**：约 80 个细分权限码，每条路由经 `permission_required` 装饰器控制，角色 + 部门双路径授权
- **会话安全**：服务端 Token 会话，库内只存 hash（防拖库还原）、8 小时超时 + 6 小时滑动续期
- **中文检索**：MySQL `ngram` 全文索引（商品名/通用名/生产企业）与拼音缩写混合搜索，见下方代码
- **国密对接**：医保模块按省级医保接口协议实现 SM2 签名 / SM4 加解密（`gmssl`），配置驱动、可整体关闭
- **任务调度**：APScheduler 定时任务（自动停售、日结、备份），cron 表达式存系统变量、后台可调
- **数据安全**：每日首次启动自动 mysqldump 备份；关键操作全部写入 `OperationLog` 审计日志

## 技术实现

库存是这条业务线的中枢，设计只有一个原则：**唯一入口**。`WarehouseEntry`（入库单）验收确认后写入 `RetailInventory`（唯一库存表），POS 销售、零售退货、购进退货全部操作这张表，不存在第二条写库存的路径。批号、供应商、色标、效期跟着库存走，追溯码挂在库存上，后果是任何一张日报表、一次召回都能沿批号向上查到供应商、向下查到售出记录。

审计盯出来的问题也真实来自这条线：最初验收记录少了「随货同行单号」，这在 GSP 第 55 条是必须核对的项，按审计报告补字段、补校验后闭环。这类「规范 → 字段 → 拦截」的映射就是整个系统的骨架。

## 亮点代码

以下均为节选（省略了与主线无关的容错和配置读取），完整实现见仓库。

### 每路由的权限控制

GSP 对计算机系统权限的要求（第 35 条类目）落到代码上就是不让任何路由裸奔。`code` 是权限码，未登录先走会话校验，登录后查角色权限：

```python
def permission_required(code):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            resp = _ensure_authenticated()
            if resp is not None:
                return resp
            user = g.get('current_user')
            if not user or not user.has_permission(code):
                flash('权限不足', 'danger')
                return redirect(url_for('index'))
            return f(*args, **kwargs)
        return decorated
    return decorator
```

### 过期库存自动停售

每天定时跑的任务：找所有已过期、还在「正常」状态的库存，为它们生成停售通知单并把库存置为停售。停售是质量管理动作，不许销售继续：

```python
def auto_stop_sale_task():
    """定时任务/手动调用：自动生成过期库存停售通知单"""
    cfg = load_stop_sale_config()
    if not cfg.get('enabled'):
        return 0

    today = date.today()
    expired_invs = RetailInventory.query.filter(
        RetailInventory.expire_date < today,
        RetailInventory.quantity > 0,
        RetailInventory.status == 'normal'
    ).all()
    if not expired_invs:
        return 0
    # 预查已停售记录，避免循环内 autoflush 冲突
    inv_ids = [inv.id for inv in expired_invs]
    existing_ids = {
        e.inventory_id for e in StopSaleNotice.query.filter(
            StopSaleNotice.inventory_id.in_(inv_ids),
            StopSaleNotice.status == 'active'
        ).all()
    }
    for seq, inv in enumerate(expired_invs, 1):
        if inv.id in existing_ids:
            continue
        notice = StopSaleNotice(
            notice_no=generate_order_no('SS', seq),
            inventory_id=inv.id,
            product_id=inv.product_id,
            batch_no=inv.batch_no,
            stop_reason='过期',
            stop_reason_detail=f'有效期至 {inv.expire_date}，系统自动停售',
            status='active',
            approver=auto_approver,
        )
        db.session.add(notice)
        inv.status = 'suspended'
    db.session.commit()
    return count
```

### 国密 SM2/SM4 医保对接

医保接口要求 SM2 签名、SM4 加密传输。把签名/验签、加解密封成统一抽象，底层库可替换（`gmssl` / tongsuo 等）：

```python
def sm2_sign(private_key: str, data: str) -> str:
    """SM2 签名（SM3withSM2），返回 hex 签名字符串"""
    public_key = _derive_public_key(private_key)
    sm2_crypt = gmssl_sm2.CryptSM2(private_key=private_key, public_key=public_key)
    return sm2_crypt.sign_with_sm3(data.encode('utf-8'))

def sm4_encrypt(key: str, plaintext: str) -> str:
    """SM4 加密（ECB + PKCS7），返回 hex 密文"""
    cipher = gmssl_sm4.CryptSM4()
    cipher.set_key(bytes.fromhex(key), gmssl_sm4.SM4_ENCRYPT)
    return cipher.crypt_ecb(plaintext.encode('utf-8')).hex()
```

### 拼音 + 全文混合搜索

药店同名商品极多（同通用名、不同厂家/规格），下拉搜「阿莫西林胶囊」还要兼顾「amxljn」这类拼音缩写输入。策略是：SQL 用 `ngram` 全文或 LIKE 粗筛限量候选，Python 里按拼音全拼/缩写精细打分排序：

```python
def _build_candidate(query, t0):
    """按首 token 构建 SQL 候选粗筛，优先走 ngram FULLTEXT 索引。

    含中文的 ≥2 字符 token 用 MATCH（product_name/common_name/manufacturer，
    走 idx_ft_product 索引）；0 命中、纯字母/单字符/含 BOOLEAN 保留字符时
    回退基础字段 LIKE 粗筛（py_short 拼音/编码/条码，FULLTEXT 无法匹配）。
    """
    has_cjk = any('\u4e00' <= c <= '\u9fff' for c in t0)
    if len(t0) >= 2 and has_cjk and not has_boolean_special(t0):
        ft = db.text("MATCH(product_name, common_name, manufacturer) AGAINST (:q IN BOOLEAN MODE)").bindparams(q='+' + t0 + '*')
        try:
            rows = query.filter(ft).limit(CANDIDATE_LIMIT).all()
            if rows:
                return rows
        except Exception:
            pass
    return query.filter(db.or_(
        ProductInfo.py_short.like(f'%{t0}%'),
        ProductInfo.product_name.like(f'%{t0}%'),
        ProductInfo.common_name.like(f'%{t0}%'),
        ProductInfo.product_code.like(f'%{t0}%'),
        ProductInfo.barcode.like(f'%{t0}%')
    )).limit(CANDIDATE_LIMIT).all()
```

## 创新：AI 用药辅助

GSP 对处方审核有硬性要求，而审方的真实痛点是**相互作用与配伍禁忌的比对量太大**：一个处方五六个药，配合患者正在服用的药与年龄/妊娠状态，组合出的人工校验维度呈指数增长。这个项目创新性地把 LLM 引入审方链路——定位明确是**「药师的助手，不是药师的替代」**，系统先过一遍规则拦截（如过期药停售），再由 AI 做 30 秒内的人力级审查，最终判断权仍在药师。

### 双 Provider 架构：云端 API + 本地推理

审方场景对隐私敏感（患者诊断、妊娠状态都是个人信息），所以没有把鸡蛋放在云端一个篮子里：

- **云端**：DeepSeek API，`deepseek-chat`，走 OpenAI 兼容 Chat Completions
- **本地**：llama.cpp 起服务（`localhost:8080`），`qwen2.5-7b` 模型，同样的接口协议

配置页一键切换 `provider`，端点/密钥/超时都可配，另带一个「测试连接」端点做配置自检。这意味着**断网也能用**——审查的算力与数据可以完全不出店。

### 输出契约：患者上下文进 prompt，审查结果严格 JSON

Prompt 模板由系统注入药品清单（通用名+规格+剂型+管控类别）与患者信息（年龄/性别/诊断/妊娠哺乳状态/正在服用的药），明确审查五类问题：

```text
1. 重复用药（相同通用名或同类药理作用）
2. 药物相互作用、配伍禁忌（含中西药十八反十九畏）
3. 用药注意事项（用法禁忌、饮食禁忌、嗜睡、禁酒）
4. 结合患者年龄、性别、妊娠状态、现有用药评估安全性
5. 孕妇、儿童、婴幼儿用药禁忌审查

→ 严格输出 JSON：
{ "has_conflict": true/false,
  "conflicts": [{"type":"重复用药|药物相互作用|配伍禁忌|注意事项",
                 "drugs":["A","B"],"severity":"严重|中等|提示",
                 "description":"具体说明"}],
  "precautions": ["注意事项（涉及药品：xxx）"] }
```

temperature 压到 `0.1`：审方是确定性任务，模型不需要「发挥」。

### LLM 输出工程：三级鲁棒解析

把「模型可能说不完全守约的 JSON」当成常态来设计，解析是三级攻关：

```python
def _find_json_blocks(content):
    """字符串感知扫描，提取所有平衡的 {...} 子串。
    追踪字符串内引号与转义，忽略字符串值里的 {}，
    避免深度计数错乱。"""
    ...
    if in_str:
        if escaped:   escaped = False
        elif ch == '\\': escaped = True
        elif ch == '"': in_str = False
    else:
        if ch == '"':   in_str = True
        elif ch == '{': depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0: ok = True; break
            ...
```

1. 请求阶段带 `response_format=json_object` 强约束；服务端不支持该参数时**自动降级**重发不带该参数的请求
2. 返回内容用「字符串感知」的平衡花括号扫描器提取 JSON 块（忽略字符串值内的 `{}`，剥 BOM 与前导散文），不做天真的整体切分
3. 轻量修复（非法控制字符、尾逗号）失败后，把「你的回复不是合法 JSON，请只输出合法 JSON 对象」追加进提示词做**最后一次修复重试**

### 安全设计与治理

- **密钥加密落库**：API Key 用 AES 加密存进 `SystemSetting`，明文旧数据自动迁移；支持 `DEEPSEEK_API_KEY` 环境变量回退
- **权限隔离**：配置页与审查接口挂 `drug_ai_view` 权限点，不是随便一个收银员可以改 provider
- **操作审计**：启停与配置变更全程写操作日志（操作类型「配置/AI辅助」）
- 界面上是处方页的 🤖「AI 用药辅助」弹窗，审查结论按 **严重/中等/提示** 三档展示，「涉及药品」直接标注——证据链完整，药师签字时一目了然

## 小结

这个项目的重心不在「技术栈多新」，而在**把行业规范翻译成数据模型和拦截逻辑**：首营三级审批、双人复核、追溯码、色标、自动停售、AI 辅助审方，每一项都对应 GSP 的明确条文和一条真实的业务拦截路径。技术实现上借了 Flask 生态的成件与「不完美但工程化驯服」的 LLM 输出，把复杂度留给业务建模，这正是这类行业系统该有的样子。
