/* encoding: utf-8

  ****  Twitter linking plugin for jQuery.fn.linkify() 1.0  ****

  Version 1.0

  Copyright (c) 2010
    Már Örlygsson  (http://mar.anomy.net/)  &
    Hugsmiðjan ehf. (http://www.hugsmidjan.is)

  Dual licensed under a MIT licence (http://en.wikipedia.org/wiki/MIT_License)
  and GPL 2.0 or above (http://www.gnu.org/licenses/old-licenses/gpl-2.0.html).

*/
jQuery.extend(jQuery.fn.linkify.plugins, {
  twitterUser: {
      re: /(^|["'(]|&lt;|\s)@([a-z0-9_-]+)((?:[:?]|\.+)?(?:\s|$)|&gt;|[)"',])/gi,
      tmpl: '$1<a href="http://www.twitter.com/$2">@$2</a>$3'
    },
  twitterHashtag: {
      // /\B#\w*[a-zA-Z]+\w*/gi  // start at word boundry - must include at least one a-z - ends at word boundry
      re: /(^|["'(]|&lt;|\s)(#.+?)((?:[:?]|\.+)?(?:\s|$)|&gt;|[)"',])/gi,
      tmpl: function (match, pre, hashTag, post) {
          return pre+'<a href="http://www.twitter.com/search?q='+ encodeURIComponent(hashTag) +'">'+hashTag+'</a>'+post;
        }
    }
});