(defproject cryogen "0.1.0"
            :description "Simple static site generator"
            :url "https://github.com/lacarmen/cryogen"
            :license {:name "Eclipse Public License"
                      :url "http://www.eclipse.org/legal/epl-v10.html"}
            :dependencies [[org.clojure/clojure "1.10.0"]
                           [ring/ring-devel "1.7.1"]
                           [compojure "1.6.1"]
                           [ring-server "0.5.0"]
                           [cryogen-markdown "0.1.11"]
                           [cryogen-core "0.2.1"]
                           [asset-minifier "0.2.7"]]
            :plugins [[lein-ring "0.12.5"]
                      [lein-asset-minifier "0.4.6"]
                      [lein-pdo "0.1.1"]]
            :main cryogen.core
            :minify-assets
            [[:css {:source "themes/nucleus/css"
                    :target "themes/nucleus/css/site.css"}]]
            :ring {:init cryogen.server/init
                   :handler cryogen.server/handler}
  :aliases {"server" ["pdo" ["minify-assets"] 
                            ["ring" "server"]]})
