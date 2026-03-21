/**
 * サイト設定コントローラー
 *
 * 目的: サイト全体の設定（タイトル・概要メッセージ）を取得・更新するAPIを提供する。
 * 注意: 設定が存在しない場合はデフォルト値で自動作成する。
 */

import type { Request, Response } from "express";
import SiteConfig from "../models/SiteConfig.js";

export const getSiteConfig = async (req: Request, res: Response) => {
  try {
    let siteConfig = await SiteConfig.findOne();

    if (!siteConfig) {
      siteConfig = await SiteConfig.create({
        title: "XX党 みんなの政策フォーラム",
        aboutMessage:
          "# このサイトについて\n\nこちらは政策フォーラムのサイトです。",
      });
    }

    res.status(200).json(siteConfig);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ message });
  }
};

export const updateSiteConfig = async (req: Request, res: Response) => {
  try {
    const { title, aboutMessage } = req.body;

    let siteConfig = await SiteConfig.findOne();

    if (siteConfig) {
      siteConfig.title = title;
      siteConfig.aboutMessage = aboutMessage;
      await siteConfig.save();
    } else {
      siteConfig = await SiteConfig.create({
        title,
        aboutMessage,
      });
    }

    res.status(200).json(siteConfig);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    res.status(500).json({ message });
  }
};
