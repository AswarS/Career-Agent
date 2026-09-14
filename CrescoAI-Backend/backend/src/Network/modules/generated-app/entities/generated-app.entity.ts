import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('generated_apps')
@Index(
  'IDX_generated_apps_user_conversation_created',
  ['userId', 'conversationId', 'createdAt'],
)
export class GeneratedAppEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer' })
  userId!: number;

  @Column({ type: 'varchar', nullable: true })
  conversationId?: string;

  @Column({ type: 'varchar', nullable: true })
  messageId?: string;

  @Column({ type: 'varchar' })
  appName!: string;

  @Column({ type: 'text', nullable: true })
  appPath?: string;

  @Column({ type: 'text', nullable: true })
  summary?: string;

  @Column({ type: 'varchar', default: 'created' })
  status!: string;

  /** App directory basename, e.g. web-app-<uuid>. Serves as the public appId. */
  @Column({ type: 'varchar', nullable: true })
  @Index('IDX_generated_apps_appId')
  appId?: string;

  /** Cross-link to the artifacts row that owns the display card. */
  @Column({ type: 'integer', nullable: true })
  artifactId?: number;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ type: 'varchar', nullable: true })
  logicalObjectId?: string;

  @Column({ type: 'integer', nullable: true })
  previousGeneratedAppId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
