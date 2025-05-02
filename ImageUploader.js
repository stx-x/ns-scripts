// ==UserScript==
// @name         NodeSeek 图片上传工具
// @namespace    https://www.nodeseek.com/
// @version      1.3.0
// @description  为 NodeSeek 论坛编辑器添加一键图片上传功能，自动压缩大图片
// @author       Claude 3.7
// @match        https://www.nodeseek.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  /**
   * 应用配置
   */
  const CONFIG = {
    // 图床API配置
    UPLOAD: {
      URL: "https://i.111666.best/image",
      AUTH_TOKEN: "H56jk78LPnxz29q3TYfDvC", // 默认令牌
      BACKUP_TOKEN: "QwErT123yUiOp456AsDfG", // 备用令牌
      BASE_URL: "https://i.111666.best",
      MAX_SIZE: 6.7, // MB
      TARGET_SIZE: 6.3, // 压缩目标大小 MB
    },
    // DOM选择器
    SELECTORS: {
      TOOLBAR: ".mde-toolbar",
      PIC_BUTTON: ".i-icon-pic",
      CODEMIRROR: "#code-mirror-editor .CodeMirror",
      TEXTAREA: ".CodeMirror textarea",
    },
    // UI配置
    UI: {
      BUTTON_CLASS: "ns-image-uploader",
      NOTIFICATION_DURATION: 3000,
    },
  };

  /**
   * 图片上传助手
   */
  class ImageUploader {
    constructor() {
      this.setupUI();
      this.addEventListeners();
      this.observeDOM();
    }

    /**
     * 设置用户界面
     */
    setupUI() {
      // 注入样式
      const style = document.createElement("style");
      style.textContent = `
                /* 上传按钮样式 */
                .${CONFIG.UI.BUTTON_CLASS} {
                    cursor: pointer;
                    transition: all 0.2s ease;
                    padding: 2px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                }

                .${CONFIG.UI.BUTTON_CLASS}:hover {
                    background-color: rgba(0, 0, 0, 0.1);
                    border-radius: 4px;
                }

                /* 加载动画 */
                .ns-spinner {
                    display: inline-block;
                    width: 16px;
                    height: 16px;
                    border: 2px solid rgba(0, 0, 0, 0.1);
                    border-top: 2px solid #3498db;
                    border-radius: 50%;
                    animation: ns-spin 1s linear infinite;
                }

                @keyframes ns-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }

                /* 通知样式 */
                .ns-notification {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    padding: 10px 16px;
                    border-radius: 4px;
                    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
                    color: white;
                    font-size: 14px;
                    z-index: 10000;
                    transition: all 0.3s ease;
                    opacity: 0;
                    transform: translateY(20px);
                }

                .ns-notification.success {
                    background-color: #4CAF50;
                }

                .ns-notification.error {
                    background-color: #f44336;
                }

                .ns-notification.info {
                    background-color: #2196F3;
                }

                .ns-notification.visible {
                    opacity: 1;
                    transform: translateY(0);
                }
            `;
      document.head.appendChild(style);

      // 添加上传按钮
      this.addUploadButton();
    }

    /**
     * 添加上传按钮到工具栏
     */
    addUploadButton() {
      // 如果按钮已存在，不重复添加
      if (document.querySelector(`.${CONFIG.UI.BUTTON_CLASS}`)) {
        return;
      }

      // 查找工具栏和图片按钮
      const toolbar = document.querySelector(CONFIG.SELECTORS.TOOLBAR);
      const picButton = toolbar?.querySelector(CONFIG.SELECTORS.PIC_BUTTON);

      if (!toolbar || !picButton) return;

      // 创建上传按钮
      const uploadButton = document.createElement("span");
      uploadButton.className = `toolbar-item i-icon ${CONFIG.UI.BUTTON_CLASS}`;
      uploadButton.title = `上传图片 (最大${CONFIG.UPLOAD.MAX_SIZE}MB，超限自动压缩)`;
      uploadButton.innerHTML = this.getUploadButtonSVG();

      // 添加按钮点击事件
      uploadButton.addEventListener("click", () =>
        this.handleUploadClick(uploadButton),
      );

      // 将按钮添加到工具栏
      picButton.parentNode.insertBefore(uploadButton, picButton.nextSibling);
    }

    /**
     * 获取上传按钮的SVG内容
     */
    getUploadButtonSVG() {
      return `
                <svg width="16" height="16" viewBox="0 0 48 48" fill="none">
                    <path d="M6 24V42H42V24" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M33 23L24 14L15 23" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M24 14V34" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            `;
    }

    /**
     * 添加事件监听器
     */
    addEventListeners() {
      // DOM已加载完成
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () =>
          this.addUploadButton(),
        );
      } else {
        this.addUploadButton();
      }
    }

    /**
     * 观察DOM变化，处理动态加载的编辑器
     */
    observeDOM() {
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.addedNodes && mutation.addedNodes.length) {
            const toolbar = document.querySelector(CONFIG.SELECTORS.TOOLBAR);
            if (
              toolbar &&
              !document.querySelector(`.${CONFIG.UI.BUTTON_CLASS}`)
            ) {
              this.addUploadButton();
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    /**
     * 处理上传按钮点击
     * @param {HTMLElement} button - 上传按钮元素
     */
    handleUploadClick(button) {
      // 创建隐藏的文件输入框
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      // 监听文件选择
      fileInput.addEventListener("change", async () => {
        try {
          if (fileInput.files && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const originalButtonContent = button.innerHTML;
            const originalButtonTitle = button.title;

            // 设置按钮加载状态
            this.setButtonLoading(button, true, "上传中...");

            // 检查是否需要压缩
            let fileToUpload = file;
            const fileSizeInMB = file.size / (1024 * 1024);

            if (fileSizeInMB > CONFIG.UPLOAD.MAX_SIZE) {
              // 设置按钮为压缩状态
              this.setButtonLoading(button, true, "压缩中...");

              // 压缩图片
              try {
                fileToUpload = await this.compressImage(file);
                // 检查压缩后的大小
                const compressedSizeMB = fileToUpload.size / (1024 * 1024);
                console.log(
                  `图片已压缩: ${fileSizeInMB.toFixed(2)}MB -> ${compressedSizeMB.toFixed(2)}MB`,
                );
              } catch (error) {
                console.error("压缩失败:", error);
                this.showNotification(`压缩失败: ${error.message}`, "error");
                this.setButtonLoading(
                  button,
                  false,
                  originalButtonTitle,
                  originalButtonContent,
                );
                document.body.removeChild(fileInput);
                return;
              }

              // 恢复为上传状态
              this.setButtonLoading(button, true, "上传中...");
            }

            // 上传图片
            try {
              const imageUrl = await this.uploadImage(fileToUpload);

              // 插入Markdown格式图片链接
              this.insertMarkdownImage(file.name, imageUrl);

              // 显示成功通知
              const wasCompressed = file !== fileToUpload;
              const message = wasCompressed
                ? "图片已自动压缩并上传成功！"
                : "图片上传成功！";
              this.showNotification(message, "success");
            } catch (error) {
              console.error("上传失败:", error);
              this.showNotification(`上传失败: ${error.message}`, "error");
            } finally {
              // 恢复按钮状态
              this.setButtonLoading(
                button,
                false,
                originalButtonTitle,
                originalButtonContent,
              );
            }
          }
        } catch (error) {
          console.error("处理错误:", error);
          this.showNotification(`错误: ${error.message}`, "error");
        } finally {
          // 清理文件输入框
          document.body.removeChild(fileInput);
        }
      });

      // 触发文件选择
      fileInput.click();
    }

    /**
     * 设置按钮加载状态
     * @param {HTMLElement} button - 按钮元素
     * @param {boolean} isLoading - 是否为加载状态
     * @param {string} title - 按钮标题
     * @param {string} [content] - 按钮内容 (仅在非加载状态有效)
     */
    setButtonLoading(button, isLoading, title, content = null) {
      if (isLoading) {
        button.innerHTML = '<span class="ns-spinner"></span>';
        button.title = title;
      } else {
        button.innerHTML = content || this.getUploadButtonSVG();
        button.title = title;
      }
    }

    /**
     * 压缩图片
     * @param {File} file - 要压缩的图片文件
     * @returns {Promise<File>} - 返回压缩后的图片文件
     */
    async compressImage(file) {
      return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
          // 创建canvas
          const canvas = document.createElement("canvas");
          let { width, height } = img;

          // 如果图片尺寸很大，适当缩小以提高压缩效率
          const MAX_DIMENSION = 4000; // 最大尺寸限制
          if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            if (width > height) {
              height = Math.floor(height * (MAX_DIMENSION / width));
              width = MAX_DIMENSION;
            } else {
              width = Math.floor(width * (MAX_DIMENSION / height));
              height = MAX_DIMENSION;
            }
          }

          // 设置canvas尺寸
          canvas.width = width;
          canvas.height = height;

          // 绘制图片到canvas
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#FFFFFF"; // 设置白色背景
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          // 目标大小范围
          const targetSize = CONFIG.UPLOAD.TARGET_SIZE; // 目标为6.3MB

          // 逐步尝试不同的压缩质量
          const compressWithQuality = (quality) => {
            try {
              canvas.toBlob(
                (blob) => {
                  if (!blob) {
                    reject(new Error("压缩过程中出错"));
                    return;
                  }

                  // 检查压缩后的大小
                  const sizeInMB = blob.size / (1024 * 1024);

                  // 如果大小已经在目标范围内，或已达到最低质量
                  if (
                    (sizeInMB <= CONFIG.UPLOAD.MAX_SIZE &&
                      sizeInMB >= targetSize * 0.9) ||
                    quality <= 0.5
                  ) {
                    // 创建新的文件对象
                    const compressedFile = new File([blob], file.name, {
                      type: "image/jpeg",
                      lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                  }
                  // 如果大小过大，继续降低质量
                  else if (sizeInMB > CONFIG.UPLOAD.MAX_SIZE) {
                    // 降低质量，但避免质量过低
                    const newQuality = Math.max(0.5, quality - 0.05);
                    setTimeout(() => compressWithQuality(newQuality), 0);
                  }
                  // 如果大小太小，尝试提高质量
                  else if (sizeInMB < targetSize * 0.85 && quality < 0.95) {
                    // 提高质量，但不超过0.95
                    const newQuality = Math.min(0.95, quality + 0.05);
                    setTimeout(() => compressWithQuality(newQuality), 0);
                  }
                  // 如果大小在合理的范围内，接受当前结果
                  else {
                    const compressedFile = new File([blob], file.name, {
                      type: "image/jpeg",
                      lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                  }
                },
                "image/jpeg",
                quality,
              );
            } catch (err) {
              reject(new Error(`压缩过程中出错: ${err.message}`));
            }
          };

          // 开始压缩，初始质量为0.9
          compressWithQuality(0.9);
        };

        img.onerror = () => {
          reject(new Error("图片加载失败"));
        };

        // 从文件创建URL加载图片
        img.src = URL.createObjectURL(file);
      });
    }

    /**
     * 上传图片到图床
     * @param {File} file - 要上传的图片文件
     * @returns {Promise<string>} - 返回上传后的图片URL
     */
    async uploadImage(file) {
      const formData = new FormData();
      formData.append("image", file);

      // 尝试使用主令牌
      try {
        return await this.tryUploadWithToken(
          formData,
          CONFIG.UPLOAD.AUTH_TOKEN,
        );
      } catch (error) {
        console.warn("主令牌上传失败，尝试备用令牌", error);
        // 如果主令牌失败，尝试备用令牌
        return await this.tryUploadWithToken(
          formData,
          CONFIG.UPLOAD.BACKUP_TOKEN,
        );
      }
    }

    /**
     * 使用特定令牌尝试上传
     * @param {FormData} formData - 表单数据
     * @param {string} token - 授权令牌
     * @returns {Promise<string>} - 返回上传后的图片URL
     */
    async tryUploadWithToken(formData, token) {
      const response = await fetch(CONFIG.UPLOAD.URL, {
        method: "POST",
        headers: {
          "Auth-Token": token,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(
          `上传请求失败: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.message || "服务器返回错误");
      }

      return `${CONFIG.UPLOAD.BASE_URL}${data.src}`;
    }

    /**
     * 在编辑器中插入Markdown格式的图片链接
     * @param {string} fileName - 文件名
     * @param {string} imageUrl - 图片URL
     */
    insertMarkdownImage(fileName, imageUrl) {
      // 获取文件名作为替代文本，去除扩展名
      const altText = fileName.replace(/\.[^/.]+$/, "");
      const imageMarkdown = `![${altText}](${imageUrl})`;

      // 尝试使用CodeMirror API插入内容
      const editorElement = document.querySelector(CONFIG.SELECTORS.CODEMIRROR);

      if (editorElement?.CodeMirror) {
        // 使用CodeMirror API
        const cm = editorElement.CodeMirror;
        const cursor = cm.getCursor();

        cm.replaceRange(imageMarkdown, cursor);

        // 将光标移动到插入内容之后
        cm.setCursor({
          line: cursor.line,
          ch: cursor.ch + imageMarkdown.length,
        });

        // 聚焦编辑器
        cm.focus();
        return;
      }

      // 如果无法获取CodeMirror实例，尝试使用textarea
      const textarea = document.querySelector(CONFIG.SELECTORS.TEXTAREA);
      if (textarea) {
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;

        // 插入内容
        textarea.value =
          textarea.value.substring(0, startPos) +
          imageMarkdown +
          textarea.value.substring(endPos);

        // 设置新的光标位置
        textarea.selectionStart = textarea.selectionEnd =
          startPos + imageMarkdown.length;

        // 聚焦输入框
        textarea.focus();
      }
    }

    /**
     * 显示通知消息
     * @param {string} message - 通知消息内容
     * @param {string} type - 通知类型 ('success', 'error', 或 'info')
     */
    showNotification(message, type) {
      // 删除现有通知
      const existingNotifications =
        document.querySelectorAll(".ns-notification");
      existingNotifications.forEach((notification) => {
        document.body.removeChild(notification);
      });

      // 创建新通知
      const notification = document.createElement("div");
      notification.className = `ns-notification ${type}`;
      notification.textContent = message;
      document.body.appendChild(notification);

      // 使通知可见
      setTimeout(() => {
        notification.classList.add("visible");
      }, 10);

      // 通知自动消失
      setTimeout(() => {
        notification.classList.remove("visible");

        // 等待过渡效果完成后删除元素
        notification.addEventListener(
          "transitionend",
          () => {
            if (notification.parentNode) {
              document.body.removeChild(notification);
            }
          },
          { once: true },
        );
      }, CONFIG.UI.NOTIFICATION_DURATION);
    }
  }

  // 初始化上传器
  new ImageUploader();

  // 在控制台显示版本信息
  console.log("NodeSeek 图片上传工具 v1.3.0 已加载");
})();
