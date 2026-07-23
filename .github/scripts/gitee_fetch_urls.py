#!/usr/bin/env python3
"""查询 Gitee Release 的附件，构建 {文件名: browser_download_url} 映射。

由 .github/workflows/release-gitee-sync.yml 在上传资产之后调用，供 gitee_rewrite_manifest.py 改写 manifest。
失败语义：真异常（含超时）直接抛出 → exit 非 0 → 步骤红；成功才写 ok=true。
实时日志：stdout 行缓冲，每步 print 立即刷到 Actions 日志。

输入（环境变量）：
  GITEE_OWNER   Gitee 组织/用户名
  GITEE_REPO    Gitee 仓库名
  RELEASE_ID    Gitee Release ID（由 gitee_create_release.py 输出）
  GITEE_TOKEN   Gitee 个人访问令牌
  GITHUB_OUTPUT Actions 步骤输出文件路径

输出：
  /tmp/gitee_url_map.json   {filename: browser_download_url}
  GITHUB_OUTPUT 追加 `ok=true`（仅成功时；失败则不写，脚本已 exit 非 0）
"""
import json
import os
import sys
import urllib.request

# 行缓冲：每行 print 立即 flush 到 Actions 日志，实时可见
sys.stdout.reconfigure(line_buffering=True)

API_TIMEOUT = 60  # Gitee API 超时（秒）


def _read_json(resp):
    """读取响应体并解析 JSON。空 body / 非 JSON（如 Gitee 偶发的 HTML 错误页）→ 返回 None。"""
    raw = resp.read().decode("utf-8", errors="replace")
    if not raw.strip():
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def main() -> None:
    owner = os.environ["GITEE_OWNER"]
    repo = os.environ["GITEE_REPO"]
    release_id = os.environ["RELEASE_ID"]
    url = (
        f"https://gitee.com/api/v5/repos/{owner}/{repo}/releases/"
        f"{release_id}?access_token={os.environ['GITEE_TOKEN']}"
    )
    print(f"Fetch Gitee Release {release_id} asset URLs…")
    with urllib.request.urlopen(url, timeout=API_TIMEOUT) as r:
        rel = _read_json(r)
    # Gitee 偶发返回 null/非对象（如 release 刚建好尚未就绪）→ 明确报错（真异常，让步骤红）
    if not isinstance(rel, dict):
        raise RuntimeError(f"Gitee release query returned non-object response: {rel!r:.200}")
    # Gitee API 字段名可能是 assets 或 attach_files，两者都兜底
    assets = rel.get("assets") or rel.get("attach_files") or []
    mapping = {
        a["name"]: a["browser_download_url"]
        for a in assets
        if isinstance(a, dict) and a.get("name") and a.get("browser_download_url")
    }
    print(f"  {len(mapping)} asset(s) with download URL")
    with open("/tmp/gitee_url_map.json", "w") as f:
        json.dump(mapping, f, indent=2)
    with open(os.environ["GITHUB_OUTPUT"], "a") as f:
        f.write("ok=true\n")
    print("Gitee asset URL map:")
    print(json.dumps(mapping, indent=2))


if __name__ == "__main__":
    # 真异常直接抛出 → exit 非 0 → 步骤红，绝不静默吞掉
    main()
