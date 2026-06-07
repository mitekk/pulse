import type { Page } from '@playwright/test'

export class ProfilePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async goto(handle: string) {
    await this.page.goto(`/@${handle}`)
  }

  /**
   * The "Follow" button (not yet following).
   * ProfileHeader passes testId="profile-follow-button" to FollowButton.
   *
   * States and their text:
   *  - Not following → "Follow"
   *  - Following (default) → "Following"
   *  - Following (hover) → "Unfollow"
   *  - Self → "Edit profile"
   *
   * We match exact "Follow" using a regex to exclude "Following" and "Unfollow".
   */
  followButton() {
    return this.page.getByTestId('profile-follow-button').filter({ hasText: /^Follow$/ })
  }

  /**
   * The "Following" button (already following).
   * The button text alternates between "Following" (default) and "Unfollow" (on hover).
   * Playwright's locator resolution can trigger onMouseEnter, making text "Unfollow".
   * We match the button when it shows either "Following" or "Unfollow".
   */
  followingButton() {
    return this.page.getByTestId('profile-follow-button').filter({ hasText: /Following|Unfollow/ })
  }

  /**
   * Unfollows a user — clicks the "Following"/"Unfollow" button and confirms via the dialog.
   * FollowButton shows a ConfirmDialog before executing the unfollow mutation.
   */
  async unfollow() {
    await this.followingButton().click()
    await this.page.getByTestId('confirm-dialog-confirm').click()
  }

  followersCount() {
    return this.page.getByTestId('profile-followers-count')
  }

  followingCount() {
    return this.page.getByTestId('profile-following-count')
  }

  profilePage(handle: string) {
    return this.page.getByTestId(`profile-page-${handle}`)
  }
}
