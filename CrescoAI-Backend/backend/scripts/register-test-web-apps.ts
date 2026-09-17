/**
 * Register the repository's test-projects as generated Web Apps for a user.
 *
 * Copies only browser-ready deliverables (never node_modules or source trees),
 * writes the canonical output.json manifest, and upserts both artifact and
 * generated_apps registry rows. Safe to run repeatedly for the same user.
 *
 * Usage:
 *   bun run ./scripts/register-test-web-apps.ts [userId]
 */
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DataSource } from 'typeorm'
import { buildAppArtifactMetadata, type WebAppManifest } from '../src/artifacts/webAppManifest.js'
import {
  careerAgentDatabasePath,
  careerAgentEntities,
} from '../src/Network/database.config.js'
import { careerAgentMigrations } from '../src/Network/migrations/migration-list.js'
import { ArtifactEntity } from '../src/Network/modules/artifact/entities/artifact.entity.js'
import { GeneratedAppEntity } from '../src/Network/modules/generated-app/entities/generated-app.entity.js'
import { UserEntity } from '../src/Network/modules/user/entities/user.entity.js'

type Project = {
  source: string
  appId: string
  slug: string
  title: string
  summary: string
  deliverable: 'single-html' | 'dist'
  makeAssetPathsRelative?: boolean
}

const backendDir = dirname(dirname(fileURLToPath(import.meta.url)))
const repoRoot = dirname(dirname(backendDir))
const userId = Number(process.argv[2] ?? 3)

if (!Number.isInteger(userId) || userId < 1) {
  throw new Error('userId must be a positive integer')
}

const projects: Project[] = [
  {
    source: 'A-event-loop',
    appId: 'web-app-event-loop',
    slug: 'event-loop-lab',
    title: '事件循环推演台',
    summary: '逐帧观察调用栈、微任务、宏任务与渲染队列，并练习预测输出顺序。',
    deliverable: 'single-html',
  },
  {
    source: 'B-nn-trainer',
    appId: 'web-app-nn-trainer',
    slug: 'neural-network-trainer',
    title: '神经网络训练可视化',
    summary: '交互调整学习率、批量和噪声，观察前向传播、梯度与损失变化。',
    deliverable: 'dist',
  },
  {
    source: 'kimi-jet-lab',
    appId: 'web-app-kimi-jet-lab',
    slug: 'kimi-jet-lab',
    title: 'KIMI 立体课本：喷气发动机实验台',
    summary: '通过三维发动机、油门和故障场景探索喷气发动机的工作过程。',
    deliverable: 'dist',
    makeAssetPathsRelative: true,
  },
  {
    source: 'photosynthesis-explainer',
    appId: 'web-app-photosynthesis',
    slug: 'photosynthesis-explainer',
    title: '一片叶子的能量工厂',
    summary: '分步骤探索叶绿体结构、光反应和卡尔文循环。',
    deliverable: 'single-html',
  },
]

const dataSource = new DataSource({
  type: 'sqlite',
  database: careerAgentDatabasePath,
  entities: careerAgentEntities,
  migrations: careerAgentMigrations,
  migrationsTransactionMode: 'all',
  synchronize: false,
})

await dataSource.initialize()
try {
  await dataSource.runMigrations({ transaction: 'all' })
  const userRepo = dataSource.getRepository(UserEntity)
  const artifactRepo = dataSource.getRepository(ArtifactEntity)
  const appRepo = dataSource.getRepository(GeneratedAppEntity)
  const user = await userRepo.findOne({ where: { id: userId } })
  if (!user) throw new Error(`User ${userId} does not exist`)

  const publicUserId = user.publicUserId || String(user.id)
  const appRoot = join(
    backendDir,
    'src',
    'Network',
    'user',
    String(user.id),
    'workspace',
    'app_generated',
  )
  await mkdir(appRoot, { recursive: true })

  for (const project of projects) {
    const sourceDir = join(repoRoot, 'test-projects', project.source)
    const targetDir = join(appRoot, project.appId)
    await mkdir(targetDir, { recursive: true })
    if (project.deliverable === 'dist') {
      await cp(join(sourceDir, 'dist'), targetDir, {
        recursive: true,
        force: true,
      })
    } else {
      await cp(join(sourceDir, 'index.html'), join(targetDir, 'index.html'), {
        force: true,
      })
    }

    if (project.makeAssetPathsRelative) {
      const indexPath = join(targetDir, 'index.html')
      const html = await readFile(indexPath, 'utf8')
      await writeFile(
        indexPath,
        html.replaceAll('src="/assets/', 'src="./assets/')
          .replaceAll('href="/assets/', 'href="./assets/'),
      )
    }

    const manifest: WebAppManifest = {
      schema: 'web-app-manifest/1.0',
      app_slug: project.slug,
      title: project.title,
      lineage: {
        logical_object_type: 'web_app',
        logical_object_id: project.slug,
        version: 1,
      },
      delivery: { title: project.title, language: 'zh-CN', offline: true },
    }
    await writeFile(
      join(targetDir, 'output.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
    )

    const url = `/api/career-agent/generated/${publicUserId}/app/${project.appId}/`
    const metadata = buildAppArtifactMetadata(manifest, project.appId)
    let app = await appRepo.findOne({ where: { userId, appId: project.appId } })
    let artifact = app?.artifactId
      ? await artifactRepo.findOne({ where: { id: app.artifactId, userId } })
      : null
    if (!artifact) {
      artifact = artifactRepo.create({ userId })
    }
    Object.assign(artifact, {
      type: 'generated-app',
      kind: 'app',
      title: project.title,
      status: 'ready',
      renderMode: 'url',
      summary: project.summary,
      payloadPath: url,
      url,
      storagePath: targetDir,
      mimeType: 'text/html',
      sizeBytes: (await stat(join(targetDir, 'index.html'))).size,
      metadataJson: JSON.stringify(metadata),
      createdAt: artifact.createdAt ?? new Date(),
    })
    artifact = await artifactRepo.save(artifact)

    if (!app) app = appRepo.create({ userId, appId: project.appId })
    Object.assign(app, {
      artifactId: artifact.id,
      appPath: targetDir,
      appName: project.title,
      summary: project.summary,
      status: 'created',
      version: 1,
      logicalObjectId: project.slug,
    })
    await appRepo.save(app)
    console.log(`${project.appId}\tartifact=${artifact.id}\t${url}`)
  }
} finally {
  await dataSource.destroy()
}
