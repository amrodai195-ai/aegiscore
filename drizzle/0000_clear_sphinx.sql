CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'system');--> statement-breakpoint
CREATE TYPE "public"."finding_severity" AS ENUM('critical', 'high', 'medium', 'low', 'info');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."patch_status" AS ENUM('proposed', 'approved', 'rejected', 'applied');--> statement-breakpoint
CREATE TYPE "public"."repository_file_status" AS ENUM('ready', 'scanning', 'complete', 'error');--> statement-breakpoint
CREATE TYPE "public"."repository_source_type" AS ENUM('github', 'upload');--> statement-breakpoint
CREATE TYPE "public"."scan_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "auditLogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer,
	"repositoryId" integer,
	"action" varchar(128) NOT NULL,
	"target" varchar(1024),
	"metadata" text,
	"success" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatMessages" (
	"id" serial PRIMARY KEY NOT NULL,
	"repositoryId" integer,
	"userId" integer,
	"role" "chat_role" NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"scanId" integer NOT NULL,
	"code" varchar(64) NOT NULL,
	"title" varchar(255) NOT NULL,
	"severity" "finding_severity" NOT NULL,
	"confidence" integer DEFAULT 80 NOT NULL,
	"filename" varchar(1024) NOT NULL,
	"lineNumber" integer DEFAULT 0 NOT NULL,
	"lineEnd" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"remediation" text,
	"evidence" text,
	"fingerprint" varchar(128) NOT NULL,
	"scanner" varchar(64) DEFAULT 'aegis-static' NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patches" (
	"id" serial PRIMARY KEY NOT NULL,
	"repositoryId" integer NOT NULL,
	"findingId" integer NOT NULL,
	"path" varchar(1024) NOT NULL,
	"title" varchar(255) NOT NULL,
	"explanation" text NOT NULL,
	"originalContent" text NOT NULL,
	"proposedContent" text NOT NULL,
	"diff" text NOT NULL,
	"status" "patch_status" DEFAULT 'proposed' NOT NULL,
	"githubCommitSha" varchar(128),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"approvedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"workspaceSlug" varchar(128) NOT NULL,
	"name" varchar(255) NOT NULL,
	"branch" varchar(128) DEFAULT 'main' NOT NULL,
	"githubOwner" varchar(128),
	"githubRepo" varchar(255),
	"githubDefaultBranch" varchar(128),
	"sourceType" "repository_source_type" DEFAULT 'upload' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositoryFiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"repositoryId" integer NOT NULL,
	"path" varchar(1024) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"mimeType" varchar(128),
	"sizeBytes" integer DEFAULT 0 NOT NULL,
	"sha" varchar(128),
	"storageKey" varchar(1024),
	"language" varchar(64),
	"status" "repository_file_status" DEFAULT 'ready' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"repositoryId" integer NOT NULL,
	"status" "scan_status" DEFAULT 'queued' NOT NULL,
	"engineVersion" varchar(64) DEFAULT 'aegis-static-1' NOT NULL,
	"filesScanned" integer DEFAULT 0 NOT NULL,
	"findingsCount" integer DEFAULT 0 NOT NULL,
	"criticalCount" integer DEFAULT 0 NOT NULL,
	"highCount" integer DEFAULT 0 NOT NULL,
	"mediumCount" integer DEFAULT 0 NOT NULL,
	"lowCount" integer DEFAULT 0 NOT NULL,
	"errorMessage" text,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"githubId" varchar(128) NOT NULL,
	"githubLogin" varchar(128) NOT NULL,
	"githubTokenEncrypted" text,
	"name" text,
	"email" varchar(320),
	"avatarUrl" varchar(1024),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_githubId_unique" UNIQUE("githubId")
);
