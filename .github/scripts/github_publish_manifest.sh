#!/usr/bin/env bash
# 把 latest-gitee.json 推到 release-manifest orphan 分支（GitHub）。
# 由 .github/workflows/release-gitee-sync.yml 在 gitee_rewrite_manifest.py 之后调用。
# orphan 分支类 gh-pages：每次全新 init + force-push，分支只保留最新一份 manifest。
#
# 职责（本脚本只推 GitHub；Gitee 由 workflow 后续 hub-mirror 步骤全量镜像）：
#   推 GitHub 的 release-manifest 分支。Gitee 侧的 release-manifest 由步骤 8 的
#   Yikun/hub-mirror-action 全量镜像同步过去（复用步骤 1 已验证的 SSH 鉴权）。
#
# 失败语义：push 失败 → set -e 中止 → exit 非 0 → 步骤红。
#
# 鉴权方式：
#   GitHub —— HTTPS 推送（x-access-token:GH_TOKEN，Actions 推同仓库的官方范式）。
#
# 输入（环境变量）：
#   GITHUB_REPOSITORY  GitHub 仓库（owner/repo，Actions 自动可用）
#   GH_TOKEN           GitHub token（推 GitHub orphan 分支，step 级）
#   TAG                发版 tag（job 级）
#   GITHUB_WORKSPACE   工作区路径（latest-gitee.json 所在，Actions 自动可用）
set -euo pipefail

WORKDIR="/tmp/release-manifest"
rm -rf "$WORKDIR"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

git init -q
git config user.name  "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout -q -b release-manifest

cp "$GITHUB_WORKSPACE/latest-gitee.json" .
git add latest-gitee.json
git commit -q -m "chore(manifest): update latest-gitee.json for ${TAG}"

# GitHub orphan 分支（权威源 + 审计）—— 失败即中止
git push -q --force "https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" release-manifest
echo "Pushed release-manifest to GitHub"
echo "::notice::GitHub release-manifest pushed; Gitee will mirror it via the next hub-mirror step"
