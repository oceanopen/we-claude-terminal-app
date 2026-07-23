#!/usr/bin/env python3
"""把 Tauri latest.json 改写为 Gitee 专属 latest-gitee.json（下载 URL 指向 Gitee）。

由 .github/workflows/release-gitee-sync.yml 在 gitee_fetch_urls.py 之后调用。
读 GitHub 版 latest.json，把 platforms.*.url 换成 Gitee Release 附件 URL；
signature / version / notes / pub_date 等字段不变（同一把私钥签名，验签公钥一致）。

输入：
  ./assets/latest.json        GitHub 版 manifest（由 gh release download 下载）
  /tmp/gitee_url_map.json     {filename: browser_download_url}（由 gitee_fetch_urls.py 生成）

输出：
  ./latest-gitee.json         Gitee 专属 manifest

失败（某平台找不到对应 Gitee URL）→ ::error:: 退出码 1（真实错误，应让 job 红）。
"""
import json
import sys

# 行缓冲：每行 print 立即 flush 到 Actions 日志，实时可见
sys.stdout.reconfigure(line_buffering=True)


def main() -> None:
    print("Rewrite latest.json → latest-gitee.json (URL → Gitee)")
    with open("./assets/latest.json") as f:
        manifest = json.load(f)
    with open("/tmp/gitee_url_map.json") as f:
        gitee_urls = json.load(f)

    # 用 url 末尾文件名匹配 Gitee 资产
    # （universal 包同时命中 darwin-aarch64 / darwin-x86_64 两个 key）
    for target, info in manifest.get("platforms", {}).items():
        fname = info["url"].rsplit("/", 1)[-1]
        gitee_url = gitee_urls.get(fname)
        if not gitee_url:
            # 容错：Gitee 可能对空格做编码，按去空格模糊匹配
            for gname, gurl in gitee_urls.items():
                if gname.replace(" ", "") == fname.replace(" ", ""):
                    gitee_url = gurl
                    break
        if not gitee_url:
            raise SystemExit(f"::error::No Gitee URL for {target} -> {fname}")
        info["url"] = gitee_url
        print(f"  {target}: {fname}\n    -> {gitee_url}")

    with open("./latest-gitee.json", "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print("Wrote ./latest-gitee.json")


if __name__ == "__main__":
    main()
